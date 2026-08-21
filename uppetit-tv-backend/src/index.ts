// src/index.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();

// Try to load generated Prisma client; if missing, fall back to an in-memory mock
function createPrismaFallback() {
  console.warn('[Prisma] Generated client not found — using in-memory fallback. Run `npx prisma generate` to enable real DB.');
  const mockDevices = new Map<string, any>();
  const mockLocations = new Map<string, any>();

  return {
    device: {
      updateMany: async ({ data }: any) => {
        mockDevices.forEach((v, k) => mockDevices.set(k, { ...v, ...data }));
        return { count: mockDevices.size };
      },
      findUnique: async ({ where }: any) => {
        return mockDevices.get(where.shortId) ?? null;
      },
      update: async ({ where, data }: any) => {
        const d = mockDevices.get(where.shortId);
        if (!d) throw new Error('NotFound');
        const updated = { ...d, ...data };
        mockDevices.set(where.shortId, updated);
        return updated;
      },
      findMany: async () => Array.from(mockDevices.values()),
      create: async ({ data }: any) => {
        mockDevices.set(data.shortId, data);
        return data;
      },
    },
    location: {
      findFirst: async () => mockLocations.size ? Array.from(mockLocations.values())[0] : null,
      create: async ({ data }: any) => {
        const id = data.id ?? `loc-${Date.now()}`;
        const rec = { id, ...data };
        mockLocations.set(id, rec);
        return rec;
      },
    },
  };
}

// Prefer real Prisma client when available; otherwise fallback to in-memory mock
let prisma: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PrismaPkg = require('@prisma/client');
  const PrismaClientCtor = (PrismaPkg as any).PrismaClient ?? (PrismaPkg as any).default ?? PrismaPkg;
  prisma = new PrismaClientCtor();
  console.log('[Prisma] Using generated Prisma client');
} catch (e) {
  console.warn('[Prisma] Generated client not available — using in-memory fallback. Run `npx prisma generate` and ensure DATABASE_URL is set to enable real DB storage.');
  prisma = createPrismaFallback();
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Хранилище активных сокетов (для мгновенной отправки команд)
const activeTVs = new Map<string, WebSocket>();

// Хранилище последней телеметрии (в памяти) — используется для быстрого ответа в API
const devicesTelemetry = new Map<string, any>();

// "Предбанник": Телевизоры, которые уже подключились, но еще НЕ добавлены в БД администратором
const pendingDevices = new Map<string, any>();

// Локальный кэш зарегистрированных устройств (shortId -> deviceSecret)
const registeredDevicesDB = new Map<string, string>();

// Вспомогательная функция для очистки "фантомных" пробелов
const sanitizeId = (id: string) => id.replace(/\s+/g, '').toUpperCase();

// ПРИ ЗАПУСКЕ СЕРВЕРА: Переводим все устройства в базе в статус offline
// и загружаем секреты/телеметрию в память
(async () => {
  try {
    const allDevices = await prisma.device.findMany();
    // Обновляем все устройства в БД в offline (на случай рестарта сервера)
    await prisma.device.updateMany({ data: { status: 'offline' } });

    allDevices.forEach((d: any) => {
      registeredDevicesDB.set(d.shortId, (d as any).deviceSecret);
      devicesTelemetry.set(d.shortId, {
        shortId: d.shortId,
        status: 'offline',
        ipAddress: d.ipAddress ?? 'Неизвестно',
        storageFree: d.storageFree ?? 0,
        androidVersion: d.androidVersion ?? null,
        lastSeen: null,
      });
    });

    console.log('✅ [DB] Инициализирован кэш зарегистрированных устройств и выставлены статусы Offline');
  } catch (e) {
    console.error('Ошибка инициализации устройств из БД:', e);
  }
})();

// ==========================================
// 1. ЛОГИКА WEBSOCKET (СВЯЗЬ С ТЕЛЕВИЗОРАМИ)
// ==========================================
wss.on('connection', (ws) => {
  const remote = (ws as any)._socket ? `${(ws as any)._socket.remoteAddress}:${(ws as any)._socket.remotePort}` : 'unknown';
  console.log('[WS] Новое подключение установлено', remote);
  let currentTvId: string | null = null;

  ws.on('error', (err) => {
    console.error('[WS] Socket error:', err);
  });

  ws.on('message', async (message) => {
    try {
      const raw = message.toString();
      console.log('[WS] Получено сообщение (raw, first 300 chars):', raw.slice(0, 300));
      const data = JSON.parse(raw);

      // Support initial auth fields (snake_case or camelCase)
      const authDeviceId = data.device_id ?? data.deviceId;
      const authSecret = data.device_secret ?? data.deviceSecret;

      // If this message contains auth fields — treat as registration/initial telemetry
      if (typeof authDeviceId === 'string' && authSecret) {
        const tvId = sanitizeId(authDeviceId);
        const secret = authSecret;

        // Save socket and mark currentTvId
        currentTvId = tvId;
        activeTVs.set(tvId, ws);

        // Look up device in DB
        const existingDevice = await prisma.device.findUnique({ where: { shortId: tvId } });

        // Common telemetry extraction helper
        const telemetry = {
          ipAddress: data.network?.ip_address || data.ip_address || data.ip || 'Неизвестно',
          storageFree: data.storage?.available_gb ?? data.storage_free ?? data.storageFree ?? 0,
          androidVersion: data.system?.android_version || data.android_version || data.androidVersion || 'Неизвестно',
          appVersion: data.app?.version || data.appVersion || data.version || null,
          rotation: (typeof data.system?.rotation === 'number') ? data.system.rotation : (typeof data.rotation === 'number' ? data.rotation : null),
        };

        if (existingDevice) {
          // Verify secret
          if (existingDevice.deviceSecret !== secret) {
            console.error(`[WS] 🚨 Неверный секрет для ID ${tvId}`);
            try { ws.send(JSON.stringify({ error: 'invalid_secret' })); } catch {}
            try { ws.close(); } catch {}
            return;
          }

          // Update device telemetry in DB (only existing columns)
          try {
            await prisma.device.update({
              where: { shortId: tvId },
              data: {
                status: 'online',
                ipAddress: telemetry.ipAddress,
                storageFree: telemetry.storageFree,
                androidVersion: telemetry.androidVersion,
                screenRotation: telemetry.rotation ?? undefined,
              }
            });
          } catch (e) {
            console.error('[WS] Ошибка обновления телеметрии в БД:', e);
          }

          console.log(`[WS] 📡 Устройство ${tvId} авторизовано и обновлено в БД`);
        } else {
          // Keep in pending map until admin pairs it
          pendingDevices.set(tvId, {
            shortId: tvId,
            deviceSecret: secret,
            status: 'online',
            ipAddress: telemetry.ipAddress,
            storageFree: telemetry.storageFree,
            androidVersion: telemetry.androidVersion,
            lastSeen: new Date().toISOString(),
          });
          console.log(`[WS] 🕒 Новый ТВ ${tvId} (не в БД) сохраняется в pendingDevices`);
        }

        // Acknowledge connection
        try { ws.send(JSON.stringify({ status: 'connected', device_id: tvId })); } catch (e) {}
        return;
      }

      // If we already have a registered tv id for this socket, use it for subsequent messages
      const tvId = currentTvId;

      if (!tvId) {
        console.log('[WS] Игнорируем сообщение от неавторизованного сокета');
        return;
      }

      // Handle event messages by type (client -> server)
      const type = data.type || data.event || data.messageType;
      const payload = data.payload ?? data;

      switch ((type || '').toString()) {
        case 'telemetry':
          console.log(`[WS][${tvId}] Telemetry:`, payload);
          // Update DB or pendingDevices
          try {
            const existing = await prisma.device.findUnique({ where: { shortId: tvId } });
            if (existing) {
              await prisma.device.update({ where: { shortId: tvId }, data: {
                status: 'online',
                ipAddress: payload.ip || payload.ipAddress || payload.network?.ip_address || existing.ipAddress,
                storageFree: payload.storageFree ?? payload.storage?.available_gb ?? existing.storageFree,
                androidVersion: payload.androidVersion ?? existing.androidVersion,
                screenRotation: payload.rotation ?? (payload.system?.rotation ?? existing.screenRotation),
              }});
              // Update in-memory telemetry cache
              devicesTelemetry.set(tvId, {
                shortId: tvId,
                status: 'online',
                ipAddress: payload.ip || payload.ipAddress || payload.network?.ip_address || existing.ipAddress,
                storageFree: payload.storageFree ?? payload.storage?.available_gb ?? existing.storageFree,
                androidVersion: payload.androidVersion ?? existing.androidVersion,
                screenRotation: payload.rotation ?? (payload.system?.rotation ?? existing.screenRotation),
                lastSeen: new Date().toISOString(),
              });
            } else {
              const p = pendingDevices.get(tvId) || {};
              const merged = { ...p, ...payload, lastSeen: new Date().toISOString(), status: 'online' };
              pendingDevices.set(tvId, merged);
              devicesTelemetry.set(tvId, { ...merged });
            }
          } catch (e) {
            console.error('[WS] Ошибка при сохранении telemetry:', e);
          }
          break;

        case 'ITEM_PLAY_STARTED':
        case 'ITEM_PLAY_ENDED':
        case 'PLAYLIST_SYNC_SUCCESS':
        case 'PLAYBACK_ERROR':
        case 'UPDATE_FAILED':
          console.log(`[WS][${tvId}] Event ${type}:`, payload);
          break;

        case 'SCREENSHOT_RESULT':
          // payload may contain { imageBase64: '...' }
          if (payload && (payload.imageBase64 || payload.image)) {
            const b64 = payload.imageBase64 ?? payload.image;
            const sizeKb = Math.round((b64.length * 3 / 4) / 1024);
            console.log(`[WS][${tvId}] Screenshot received, size ~${sizeKb}KB`);

            // Optionally save to disk if env var is set
            try {
              if (process.env.SAVE_SCREENSHOTS === '1') {
                const dir = path.resolve(process.cwd(), 'screenshots');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const buf = Buffer.from(b64, 'base64');
                const filename = path.join(dir, `${tvId}-${Date.now()}.png`);
                fs.writeFileSync(filename, buf);
                console.log(`[WS][${tvId}] Screenshot saved to ${filename}`);
              }
            } catch (e) {
              console.error('[WS] Ошибка сохранения скриншота:', e);
            }

          } else {
            console.log(`[WS][${tvId}] SCREENSHOT_RESULT with no image payload`, payload);
          }
          break;

        default:
          // Also support ad-hoc telemetry without type
          if (!type && payload && (payload.ip || payload.storageFree || payload.androidVersion || payload.appVersion)) {
            console.log(`[WS][${tvId}] Implicit telemetry payload:`, payload);
          } else {
            console.log(`[WS][${tvId}] Unknown message type: ${type}`, payload);
          }
      }

    } catch (e) {
      console.error('[WS] Ошибка обработки сообщения:', e);
    }
  });

  ws.on('close', async () => {
    if (currentTvId !== null) {
      activeTVs.delete(currentTvId);
      
      // Если устройство было в ожидании — просто помечаем статус в памяти
      if (pendingDevices.has(currentTvId)) {
        const info = pendingDevices.get(currentTvId);
        info.status = 'offline';
        pendingDevices.set(currentTvId, info);
      } else {
        // Если устройство в БД — обновляем статус в Prisma
        try {
          await prisma.device.update({
            where: { shortId: currentTvId },
            data: { status: 'offline' }
          });
        } catch (e) {
          // Игнорируем ошибку (возможно, устройство только что удалили из БД)
        }
      }
      console.log(`[WS] Телевизор ${currentTvId} отключился. Статус: Offline`);
    } else {
      console.log('[WS] Закрытие сокета без зарегистрированного TV id');
    }
  });
});

// ==========================================
// 2. REST API (ДЛЯ ВЕБ-КЛИЕНТА НА REACT)
// ==========================================

// Получить статусы ВСЕХ устройств (И из БД, и те, что ждут привязки)
app.get('/api/devices/status', async (req, res) => {
  try {
    const dbDevices = await prisma.device.findMany();

    // Devices from DB (without secret)
    const safeDbDevices = dbDevices.map((d: any) => { const { deviceSecret, ...rest } = d; return rest; });

    // Merge with in-memory telemetry (pending + live)
    const inMemory = Array.from(devicesTelemetry.values()).map((d: any) => {
      const { deviceSecret, ...rest } = d; return rest;
    });

    // Also include pendingDevices entries that may not be in devicesTelemetry
    const pendingOnly = Array.from(pendingDevices.values()).filter((p: any) => !devicesTelemetry.has(p.shortId)).map((d: any) => { const { deviceSecret, ...rest } = d; return rest; });

    // Combine: DB devices first, then in-memory ones that are not in DB
    const dbIds = new Set(safeDbDevices.map((d: any) => d.shortId));
    const merged = [...safeDbDevices, ...inMemory.filter((d:any) => !dbIds.has(d.shortId)), ...pendingOnly];

    res.status(200).json({ success: true, devices: merged });
  } catch (e) {
    console.error('[API] Ошибка чтения статусов:', e);
    res.status(500).json({ success: false, message: 'Ошибка БД' });
  }
});

// Привязать ТВ (переносим из ожидающих в Prisma)
app.post('/api/devices/pair', async (req, res) => {
  const requestedId = sanitizeId(req.body.shortId || '');
  const deviceName = req.body.name || 'Новый ТВ';
  let locationId = req.body.locationId;

  // Ищем телевизор среди "висящих" в памяти
  if (pendingDevices.has(requestedId)) {
    const telemetry = pendingDevices.get(requestedId);
    
    try {
      // ЗАЩИТА: Если фронтенд не передал локацию, создаем/находим дефолтную,
      // так как Prisma не разрешит создать Device без locationId
      if (!locationId) {
        let fallbackLoc = await prisma.location.findFirst();
        if (!fallbackLoc) {
          fallbackLoc = await prisma.location.create({
            data: { name: 'Склад (Нераспределенные)', address: 'Не указан' }
          });
        }
        locationId = fallbackLoc.id;
      }

      // СОХРАНЯЕМ В PRISMA НАВСЕГДА
      const newDevice = await prisma.device.create({
        data: {
          shortId: telemetry.shortId,
          deviceSecret: telemetry.deviceSecret,
          name: deviceName,
          status: telemetry.status,
          ipAddress: telemetry.ipAddress,
          storageFree: telemetry.storageFree,
          androidVersion: telemetry.androidVersion,
        screenRotation: telemetry.rotation ?? 0,
        locationId: locationId
      }
      });

      // Удаляем из "предбанника", теперь он живет в БД
      pendingDevices.delete(requestedId);

      // Обновляем локальные кэши
      registeredDevicesDB.set(newDevice.shortId, (newDevice as any).deviceSecret);
      devicesTelemetry.set(newDevice.shortId, {
        shortId: newDevice.shortId,
        status: newDevice.status,
        ipAddress: newDevice.ipAddress ?? 'Неизвестно',
        storageFree: newDevice.storageFree ?? 0,
        androidVersion: newDevice.androidVersion ?? null,
        lastSeen: new Date().toISOString(),
      });
      
      console.log(`[API] 🔗 Телевизор ${requestedId} успешно сохранен в БД PostgreSQL!`);
      
      const { deviceSecret, ...safeTelemetry } = newDevice;
      res.status(200).json({ success: true, message: 'Устройство привязано', device: safeTelemetry });

    } catch (e) {
      console.error('[API] Ошибка сохранения в БД:', e);
      res.status(500).json({ success: false, message: 'Ошибка записи в базу данных' });
    }
  } else {
    // Проверяем, может он уже привязан
    const existing = await prisma.device.findUnique({ where: { shortId: requestedId } });
    if (existing) {
      res.status(400).json({ success: false, message: 'Это устройство уже привязано!' });
    } else {
      res.status(404).json({ success: false, message: 'Телевизор с таким кодом не найден в сети. Убедитесь, что он включен.' });
    }
  }
});

// Отправить команду (манифест) на ТВ
app.post('/api/devices/:shortId/sync', (req, res) => {
  const requestedId = sanitizeId(req.params.shortId);
  const manifest = req.body;

  const tvSocket = activeTVs.get(requestedId);

  if (tvSocket && tvSocket.readyState === WebSocket.OPEN) {
    // Normalize outgoing command structure
    const commandName = manifest.command || req.body.command || (manifest.items ? 'UPDATE_PLAYLIST' : 'COMMAND');

    // Special-case: SET_ROTATION may include rotation at top-level (legacy client expects that)
    let outgoing: any;
    const rotationValue = manifest.rotation ?? manifest.payload?.rotation ?? manifest.payload?.rotationDegrees ?? undefined;
    if (commandName === 'SET_ROTATION' && typeof rotationValue !== 'undefined') {
      outgoing = {
        command: 'SET_ROTATION',
        rotation: rotationValue,
        timestamp: new Date().toISOString(),
      };
    } else {
      outgoing = {
        command: commandName,
        payload: manifest.payload ?? (manifest.items ? { items: manifest.items } : manifest),
        timestamp: new Date().toISOString(),
      };
    }

    try {
      tvSocket.send(JSON.stringify(outgoing));
      console.log(`[API] Отправлено на ТВ ${requestedId}:`, { command: outgoing.command, payloadSummary: Array.isArray(outgoing.payload?.items) ? `${outgoing.payload.items.length} items` : (outgoing.rotation ? `rotation ${outgoing.rotation}` : Object.keys(outgoing.payload || {}).slice(0,5)) });
      res.status(200).json({ success: true, message: 'Команда отправлена', command: outgoing.command });
    } catch (e) {
      console.error('[API] Ошибка отправки в сокет:', e);
      res.status(500).json({ success: false, message: 'Ошибка отправки команды' });
    }
  } else {
    console.log(`[API] Ошибка: ТВ ${requestedId} не в сети`);
    res.status(404).json({ success: false, message: 'Устройство не в сети' });
  }
});

const PORT = Number(process.env.PORT ?? 3001);
// Bind to 0.0.0.0 so LAN devices (e.g., Android client) can connect to server's LAN IP
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Бэкенд запущен на http://0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket сервер слушает на ws://<your-host-ip>:${PORT}`);
});