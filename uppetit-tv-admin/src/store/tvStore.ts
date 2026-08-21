import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

// Adapter для сохранения в IndexedDB через idb-keyval
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export interface PlaylistItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  duration: number;
  name: string;
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
}

export interface Device {
  id: string;
  shortId: string;
  name: string;
  locationId: string;
  status: 'online' | 'offline';
  ipAddress: string;
  storageFree: number;
  androidVersion: string;
  assignedPlaylistId: string | null;
  screenRotation: number;
}

export interface LocationItem {
  id: string;
  name: string;
  address: string;
}

interface TvStore {
  locations: LocationItem[];
  devices: Device[];
  playlists: Playlist[];

  addLocation: (name: string, address: string) => void;
  removeLocation: (id: string) => void;

  addDevice: (device: { shortId: string; name: string; locationId: string }) => void;
  removeDevice: (id: string) => void;
  assignPlaylistToDevice: (deviceId: string, playlistId: string | null) => void;
  assignPlaylistToLocation: (locationId: string, playlistId: string | null) => void;
  updateDeviceRotation: (deviceId: string, rotation: number) => void;

  updateDeviceTelemetry: (telemetryList: Partial<Device>[]) => void;

  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  addMediaToPlaylist: (playlistId: string, item: PlaylistItem) => void;
  removeMediaFromPlaylist: (playlistId: string, mediaId: string) => void;
  updateMediaDuration: (playlistId: string, mediaId: string, duration: number) => void;

  reorderMediaInPlaylist: (playlistId: string, oldIndex: number, newIndex: number) => void;
}

export const useTvStore = create<TvStore>()(
  persist(
    (set) => ({
      locations: [
        { id: 'loc-1', name: 'Флагман на Невском', address: 'Невский пр., 42' },
        { id: 'loc-2', name: 'Точка на Лиговском', address: 'Лиговский пр., 10' },
      ],
      // ИСПРАВЛЕНИЕ: Возвращаем твой реальный ТВ в стартовый набор
      devices: [
        {
          id: 'dev-1',
          shortId: 'NQA M3L', // Твой реальный код
          name: 'Главный экран',
          locationId: 'loc-1',
          status: 'offline', 
          ipAddress: 'Ожидание сети...', 
          storageFree: 0,
          androidVersion: '-',
          assignedPlaylistId: null,
          screenRotation: 0,
        },
      ],
      playlists: [
        {
          id: 'pl-1',
          name: 'Утреннее меню',
          items: [
            {
              id: 'item-1',
              url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1080&auto=format&fit=crop',
              type: 'image',
              duration: 10,
              name: 'Бургер Акция.jpg',
            },
          ],
        },
      ],

      addLocation: (name, address) =>
        set((state) => ({
          locations: [...state.locations, { id: `loc-${Date.now()}`, name, address }],
        })),

      removeLocation: (id) =>
        set((state) => ({
          locations: state.locations.filter((l) => l.id !== id),
          devices: state.devices.filter((d) => d.locationId !== id),
        })),

      addDevice: (data) =>
        set((state) => ({
          devices: [
            ...state.devices,
            {
              id: `dev-${Date.now()}`,
              shortId: data.shortId.replace(/\s+/g, '').toUpperCase(),
              name: data.name,
              locationId: data.locationId,
              status: 'offline', 
              ipAddress: 'Ожидание сети...', 
              storageFree: 0,
              androidVersion: '-',
              assignedPlaylistId: null,
              screenRotation: 0,
            },
          ],
        })),

      removeDevice: (id) => set((state) => ({ devices: state.devices.filter((d) => d.id !== id) })),

      assignPlaylistToDevice: (deviceId, playlistId) =>
        set((state) => ({ devices: state.devices.map((d) => (d.id === deviceId ? { ...d, assignedPlaylistId: playlistId } : d)) })),

      assignPlaylistToLocation: (locationId, playlistId) =>
        set((state) => ({ devices: state.devices.map((d) => (d.locationId === locationId ? { ...d, assignedPlaylistId: playlistId } : d)) })),

      updateDeviceRotation: (deviceId, rotation) =>
        set((state) => ({ devices: state.devices.map((d) => (d.id === deviceId ? { ...d, screenRotation: rotation } : d)) })),

      updateDeviceTelemetry: (telemetryList) => set((state) => {
        const updatedDevices = state.devices.map((device) => {
          const safeLocalId = device.shortId?.replace(/\s+/g, '').toUpperCase();
          const telemetry = telemetryList.find(
            (t) => t.shortId?.replace(/\s+/g, '').toUpperCase() === safeLocalId
          );

          if (telemetry) {
            return {
              ...device,
              status: (telemetry.status as 'online' | 'offline') || 'offline',
              ipAddress: telemetry.ipAddress || device.ipAddress,
              // ИСПРАВЛЕНИЕ: Гарантируем, что память будет числом
              storageFree: telemetry.storageFree !== undefined ? Number(telemetry.storageFree) : device.storageFree,
              // ИСПРАВЛЕНИЕ: Если версия уже содержит слово Android, мы не будем его дублировать
              androidVersion: telemetry.androidVersion ? String(telemetry.androidVersion).replace('Android ', '') : device.androidVersion,
              // Поддержка поворота экрана из телеметрии
              screenRotation: telemetry.screenRotation !== undefined ? Number(telemetry.screenRotation) : device.screenRotation,
            };
          } else {
            return { ...device, status: 'offline' as const };
          }
        });

        return { devices: updatedDevices };
      }),

      createPlaylist: (name) => set((state) => ({ playlists: [...state.playlists, { id: `pl-${Date.now()}`, name, items: [] }] })),

      deletePlaylist: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
          devices: state.devices.map((d) => (d.assignedPlaylistId === id ? { ...d, assignedPlaylistId: null } : d)),
        })),

      addMediaToPlaylist: (playlistId, item) =>
        set((state) => ({ playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, items: [...p.items, item] } : p)) })),

      removeMediaFromPlaylist: (playlistId, mediaId) =>
        set((state) => ({ playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, items: p.items.filter((i) => i.id !== mediaId) } : p)) })),

      updateMediaDuration: (playlistId, mediaId, duration) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId ? { ...p, items: p.items.map((i) => (i.id === mediaId ? { ...i, duration } : i)) } : p
          ),
        })),

      reorderMediaInPlaylist: (playlistId, oldIndex, newIndex) =>
        set((state) => {
          const playlist = state.playlists.find((p) => p.id === playlistId);
          if (!playlist) return {} as Partial<TvStore>;

          const newItems = [...playlist.items];
          const [movedItem] = newItems.splice(oldIndex, 1);
          if (!movedItem) return {} as Partial<TvStore>;
          newItems.splice(newIndex, 0, movedItem);

          return {
            playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, items: newItems } : p)),
          } as Partial<TvStore>;
        }),
    }),
    {
      // ИСПРАВЛЕНИЕ: Изменили ключ, чтобы сбросить старый пустой кэш браузера
      name: 'uppetit-tv-storage-v2',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);