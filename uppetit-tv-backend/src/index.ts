// src/index.ts
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();

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

let prisma: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PrismaPkg = require('@prisma/client');
  const PrismaClientCtor = (PrismaPkg as any).PrismaClient ?? (PrismaPkg as any).default ?? PrismaPkg;
  prisma = new PrismaClientCtor();
  console.log('[Prisma] Using generated Prisma client');
} catch (e) {
  console.warn('[Prisma] Generated client not available — using in-memory fallback.');
  prisma = createPrismaFallback();
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const activeTVs = new Map<string, any>();
const devicesTelemetry = new Map<string, any>();
const pendingDevices = new Map<string, any>();
const registeredDevicesDB = new Map<string, string>();
const deviceLogs = new Map<string, string>();

const sanitizeId = (id: string) => id.replace(/\s+/g, '').toUpperCase();

(async () => {
  try {
    const allDevices = await prisma.device.findMany();
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

// HEARTBEAT INTERVAl
const interval = setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      console.log('[WS] Устройство не отвечает, разрыв соединения...');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws: any) => {
  const remote = ws._socket ? `${ws._socket.remoteAddress}:${ws._socket.remotePort}` : 'unknown';
  console.log('[WS] Новое подключение установлено', remote);
  let currentTvId: string | null = null;
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('error', (err: any) => console.error('[WS] Socket error:', err));

  ws.on('message', async (message: any) => {
    try {
      const raw = message.toString();
      const data = JSON.parse(raw);

      const authDeviceId = data.device_id ?? data.deviceId;
      const authSecret = data.device_secret ?? data.deviceSecret;

      if (typeof authDeviceId === 'string' && authSecret) {
        const tvId = sanitizeId(authDeviceId);
        const secret = authSecret;

        currentTvId = tvId;
        activeTVs.set(tvId, ws);

        const existingDevice = await prisma.device.findUnique({ where: { shortId: tvId } });

        const telemetry = {
          ipAddress: data.network?.ip_address || data.ip_address || data.ip || 'Неизвестно',
          storageFree: data.storage?.available_gb ?? data.storage_free ?? data.storageFree ?? 0,
          androidVersion: data.system?.android_version || data.android_version || data.androidVersion || 'Неизвестно',
          appVersion: data.app?.version || data.appVersion || data.version || null,
          rotation: (typeof data.system?.rotation === 'number') ? data.system.rotation : (typeof data.rotation === 'number' ? data.rotation : null),
        };

        if (existingDevice) {
          if (existingDevice.deviceSecret !== secret) {
            console.error(`[WS] 🚨 Неверный секрет для ID ${tvId}`);
            try { ws.send(JSON.stringify({ error: 'invalid_secret' })); ws.close(); } catch {}
            return;
          }

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

        try { ws.send(JSON.stringify({ status: 'connected', device_id: tvId })); } catch (e) {}
        return;
      }

      const tvId = currentTvId;
      if (!tvId) return;

      const type = data.type || data.event || data.messageType || data.event_type;
      const payload = data.payload ?? data;

      switch ((type || '').toString()) {
        case 'telemetry':
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
          } catch (e) {}
          break;

        case 'LOGS_REPORT':
          console.log(`[WS][${tvId}] Получены логи`);
          deviceLogs.set(tvId, payload.logs || payload.content || JSON.stringify(payload));
          break;

        case 'SCREENSHOT_RESULT':
          if (payload && (payload.imageBase64 || payload.image)) {
            const b64 = payload.imageBase64 ?? payload.image;
            try {
              if (process.env.SAVE_SCREENSHOTS === '1') {
                const dir = path.resolve(process.cwd(), 'screenshots');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const buf = Buffer.from(b64, 'base64');
                const filename = path.join(dir, `${tvId}-${Date.now()}.png`);
                fs.writeFileSync(filename, buf);
              }
            } catch (e) {}
          }
          break;
      }
    } catch (e) {
      console.error('[WS] Ошибка обработки сообщения:', e);
    }
  });

  ws.on('close', async () => {
    if (currentTvId !== null) {
      activeTVs.delete(currentTvId);
      if (pendingDevices.has(currentTvId)) {
        const info = pendingDevices.get(currentTvId);
        info.status = 'offline';
        pendingDevices.set(currentTvId, info);
      } else {
        try { await prisma.device.update({ where: { shortId: currentTvId }, data: { status: 'offline' } }); } catch (e) {}
      }
    }
  });
});

app.get('/api/devices/status', async (req, res) => {
  try {
    const dbDevices = await prisma.device.findMany();
    const safeDbDevices = dbDevices.map((d: any) => { const { deviceSecret, ...rest } = d; return rest; });
    const inMemory = Array.from(devicesTelemetry.values()).map((d: any) => { const { deviceSecret, ...rest } = d; return rest; });
    const pendingOnly = Array.from(pendingDevices.values()).filter((p: any) => !devicesTelemetry.has(p.shortId)).map((d: any) => { const { deviceSecret, ...rest } = d; return rest; });
    
    const dbIds = new Set(safeDbDevices.map((d: any) => d.shortId));
    const merged = [...safeDbDevices, ...inMemory.filter((d:any) => !dbIds.has(d.shortId)), ...pendingOnly];
    res.status(200).json({ success: true, devices: merged });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Ошибка БД' });
  }
});

app.post('/api/devices/pair', async (req, res) => {
  const requestedId = sanitizeId(req.body.shortId || '');
  let locationId = req.body.locationId;

  if (pendingDevices.has(requestedId)) {
    const telemetry = pendingDevices.get(requestedId);
    try {
      if (!locationId) {
        let fallbackLoc = await prisma.location.findFirst();
        if (!fallbackLoc) fallbackLoc = await prisma.location.create({ data: { name: 'Склад', address: 'Не указан' } });
        locationId = fallbackLoc.id;
      }
      const newDevice = await prisma.device.create({
        data: {
          shortId: telemetry.shortId,
          deviceSecret: telemetry.deviceSecret,
          name: req.body.name || 'Новый ТВ',
          status: telemetry.status,
          ipAddress: telemetry.ipAddress,
          storageFree: telemetry.storageFree,
          androidVersion: telemetry.androidVersion,
          screenRotation: telemetry.rotation ?? 0,
          locationId: locationId
        }
      });
      pendingDevices.delete(requestedId);
      registeredDevicesDB.set(newDevice.shortId, (newDevice as any).deviceSecret);
      devicesTelemetry.set(newDevice.shortId, { ...newDevice, lastSeen: new Date().toISOString() });
      
      const { deviceSecret, ...safeTelemetry } = newDevice;
      res.status(200).json({ success: true, device: safeTelemetry });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Ошибка записи в базу данных' });
    }
  } else {
    res.status(404).json({ success: false, message: 'Телевизор не найден в сети' });
  }
});

app.post('/api/devices/:shortId/sync', (req, res) => {
  const requestedId = sanitizeId(req.params.shortId);
  const manifest = req.body;
  const tvSocket = activeTVs.get(requestedId);

  if (tvSocket && tvSocket.readyState === WebSocket.OPEN) {
    const commandName = manifest.command || req.body.command || (manifest.items ? 'UPDATE_PLAYLIST' : 'COMMAND');
    let outgoing: any;
    const rotationValue = manifest.rotation ?? manifest.payload?.rotation ?? manifest.payload?.rotationDegrees ?? undefined;
    if (commandName === 'SET_ROTATION' && typeof rotationValue !== 'undefined') {
      outgoing = { command: 'SET_ROTATION', rotation: rotationValue, timestamp: new Date().toISOString() };
    } else {
      outgoing = { command: commandName, payload: manifest.payload ?? (manifest.items ? { items: manifest.items } : manifest), timestamp: new Date().toISOString() };
    }

    try {
      tvSocket.send(JSON.stringify(outgoing));
      res.status(200).json({ success: true, message: 'Команда отправлена', command: outgoing.command });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Ошибка отправки команды' });
    }
  } else {
    res.status(404).json({ success: false, message: 'Устройство не в сети' });
  }
});

app.post('/api/devices/:shortId/request-logs', (req, res) => {
  const requestedId = sanitizeId(req.params.shortId);
  const tvSocket = activeTVs.get(requestedId);

  if (tvSocket && tvSocket.readyState === WebSocket.OPEN) {
    tvSocket.send(JSON.stringify({ command: 'GET_LOGS', timestamp: new Date().toISOString() }));
    res.status(200).json({ success: true, message: 'Запрос логов отправлен' });
  } else {
    res.status(404).json({ success: false, message: 'Устройство не в сети' });
  }
});

app.get('/api/devices/:shortId/logs', (req, res) => {
  const requestedId = sanitizeId(req.params.shortId);
  if (deviceLogs.has(requestedId)) {
    res.status(200).json({ success: true, logs: deviceLogs.get(requestedId) });
  } else {
    res.status(404).json({ success: false, message: 'Логи пока не получены' });
  }
});

const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Бэкенд запущен на http://0.0.0.0:${PORT}`);
});