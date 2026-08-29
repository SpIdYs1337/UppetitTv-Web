// src/api/deviceService.ts
import type { Playlist, PlaylistItem, Device } from '../store/tvStore';

interface TvCommandManifest {
  command: 'UPDATE_PLAYLIST' | 'UNPAIR_DEVICE';
  playlist_id?: string;
  clear_old_cache?: boolean;
  device_id?: string;
  items?: Array<{
    id: string;
    type: 'image' | 'video';
    url: string;
    duration_seconds: number;
    rotation: number;
  }>;
}

const API_URL = 'http://localhost:3001';

export const DeviceService = {
  fetchDevicesStatus: async (): Promise<Partial<Device>[] | null> => {
    try {
      const response = await fetch(`${API_URL}/api/devices/status`, { cache: 'no-store' });
      const data = await response.json();
      if (data.success && Array.isArray(data.devices)) {
        return data.devices;
      }
      return null;
    } catch (error) {
      console.error('[NETWORK] Ошибка получения статусов устройств:', error);
      return null;
    }
  },

  pairDevice: async (shortId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/devices/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Ошибка привязки');
      return result.device;
    } catch (error: any) {
      alert(error.message || 'Не удалось привязать ТВ');
      return null;
    }
  },

  sendPlaylistToDevice: async (device: Device, playlist: Playlist, clearCache: boolean = true) => {
    const manifest: TvCommandManifest = {
      command: 'UPDATE_PLAYLIST',
      playlist_id: playlist.id,
      clear_old_cache: clearCache,
      items: playlist.items.map((item: PlaylistItem) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        duration_seconds: item.duration,
        rotation: device.screenRotation || 0
      }))
    };

    try {
      const response = await fetch(`${API_URL}/api/devices/${device.shortId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Ошибка сети');
      return true;
    } catch (error) {
      alert(`Не удалось отправить на ${device.name}. Возможно, телевизор не в сети.`);
      return false;
    }
  },

  unpairDevice: async (shortId: string) => {
    const manifest: TvCommandManifest = {
      command: 'UNPAIR_DEVICE',
      device_id: shortId
    };
    try {
      const response = await fetch(`${API_URL}/api/devices/${shortId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Ошибка сети');
      return true;
    } catch (error) {
      return false;
    }
  },

  setRotation: async (shortId: string, angle: 0|90|180|270) => {
    const manifest: any = { command: 'SET_ROTATION', rotation: angle };
    try {
      const response = await fetch(`${API_URL}/api/devices/${shortId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Ошибка сети');
      return true;
    } catch (error) {
      alert('Не удалось отправить команду поворота. Устройство может быть оффлайн.');
      return false;
    }
  },

  requestLogs: async (shortId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/devices/${shortId}/request-logs`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      return { success: false };
    }
  },

  fetchLogs: async (shortId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/devices/${shortId}/logs`, { cache: 'no-store' });
      return await response.json();
    } catch (e) {
      return { success: false };
    }
  }
};