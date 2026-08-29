import { useState, useEffect } from 'react';
import { useTvStore } from '../store/tvStore';
import { PairDeviceModal } from '../components/tv/PairDeviceModal';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { 
  MapPin, Tv, ChevronDown, ChevronUp, Search, 
  Layers, Plus, Trash2, CheckCircle2, AlertCircle, Monitor, RefreshCw, FileText 
} from 'lucide-react';
import { DeviceService } from '../api/deviceService';

export const Dashboard = () => {
  const { 
    locations, devices, playlists, removeDevice, 
    assignPlaylistToDevice, assignPlaylistToLocation, 
    addLocation, removeLocation, updateDeviceRotation, 
    updateDeviceTelemetry 
  } = useTvStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [collapsedLocations, setCollapsedLocations] = useState<Record<string, boolean>>({});
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddr, setNewLocAddr] = useState('');
  const [showAddLocForm, setShowAddLocForm] = useState(false);

  // States for Logs UI
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState('');
  const [pollingDevice, setPollingDevice] = useState<string | null>(null);

  const isOnline = useNetworkStatus();

  useEffect(() => {
    const pollTelemetry = async () => {
      const telemetry = await DeviceService.fetchDevicesStatus();
      if (telemetry && telemetry.length > 0) {
        updateDeviceTelemetry(telemetry);
      }
    };
    pollTelemetry();
    const intervalId = setInterval(pollTelemetry, 3000);
    return () => clearInterval(intervalId);
  }, [updateDeviceTelemetry]);

  const handleRequestLogs = async (shortId: string) => {
    setPollingDevice(shortId);
    const req = await DeviceService.requestLogs(shortId);
    
    if (!req.success) {
      alert('Не удалось запросить логи с устройства');
      setPollingDevice(null);
      return;
    }
    
    // Polling mechanism
    const pollInterval = setInterval(async () => {
      const res = await DeviceService.fetchLogs(shortId);
      if (res.success && res.logs) {
        setCurrentLogs(res.logs);
        setLogModalOpen(true);
        setPollingDevice(null);
        clearInterval(pollInterval);
      }
    }, 3000);
    
    // Fallback stop after 30 seconds
    setTimeout(() => {
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollingDevice(null);
      }
    }, 30000);
  };

  const toggleLocation = (locId: string) => setCollapsedLocations(prev => ({ ...prev, [locId]: !prev[locId] }));

  const handleAddLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim() || !newLocAddr.trim()) return;
    addLocation(newLocName, newLocAddr);
    setNewLocName('');
    setNewLocAddr('');
    setShowAddLocForm(false);
  };

  const totalDevices = devices.length;
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;

  return (
    <div className="space-y-8 relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 p-5 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Торговые точки</p>
            <h3 className="text-3xl font-bold mt-1">{locations.length}</h3>
          </div>
          <div className="p-3 bg-[#EA580C]/10 text-[#F97316] rounded-xl border border-[#EA580C]/20"><MapPin size={24} /></div>
        </div>
        <div className="bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 p-5 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Всего экранов</p>
            <h3 className="text-3xl font-bold mt-1">{totalDevices}</h3>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20"><Tv size={24} /></div>
        </div>
        <div className="bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 p-5 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">В эфире (Онлайн)</p>
            <h3 className="text-3xl font-bold text-green-400 mt-1">{onlineDevices}</h3>
          </div>
          <div className="p-3 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20"><CheckCircle2 size={24} /></div>
        </div>
        <div className="bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 p-5 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Проблема (Офлайн)</p>
            <h3 className="text-3xl font-bold text-red-400 mt-1">{offlineDevices}</h3>
          </div>
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20"><AlertCircle size={24} /></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[#141414]/40 p-4 rounded-2xl border border-[#2A2A2A]/50 backdrop-blur-xl">
        <div className="flex flex-1 items-center gap-3 bg-black/40 px-4 py-2.5 rounded-xl border border-[#2A2A2A]/50 focus-within:border-[#EA580C]">
          <Search size={18} className="text-gray-500" />
          <input 
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по точке, названию ТВ или ID..."
            className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-full"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-black/40 border border-[#2A2A2A]/50 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#EA580C]"
          >
            <option value="all">Все статусы</option>
            <option value="online">Только Онлайн</option>
            <option value="offline">Только Офлайн</option>
          </select>
          <button onClick={() => setShowAddLocForm(!showAddLocForm)} className="bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-xl border border-white/10 transition-colors flex items-center gap-2 text-sm">
            <Plus size={16} /> + Точка
          </button>
          <button onClick={() => setIsModalOpen(true)} className="bg-[#EA580C] hover:bg-[#F97316] text-white font-semibold py-2.5 px-5 rounded-xl transition-colors shadow-lg shadow-orange-900/20 border border-[#F97316]/30 flex items-center gap-2 text-sm">
            <Tv size={16} /> + Привязать ТВ
          </button>
        </div>
      </div>

      {showAddLocForm && (
        <form onSubmit={handleAddLocationSubmit} className="bg-[#141414]/80 border border-[#EA580C]/40 p-5 rounded-2xl backdrop-blur-xl flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">Название торговой точки</label>
            <input type="text" value={newLocName} onChange={e => setNewLocName(e.target.value)} placeholder="Например: ТЦ Галерея" className="w-full bg-black/50 border border-[#2A2A2A] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#EA580C]" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">Адрес</label>
            <input type="text" value={newLocAddr} onChange={e => setNewLocAddr(e.target.value)} placeholder="Например: Лиговский пр., 30" className="w-full bg-black/50 border border-[#2A2A2A] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#EA580C]" />
          </div>
          <button type="submit" className="bg-[#EA580C] text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-[#F97316] transition-colors text-sm">Сохранить точку</button>
        </form>
      )}

      <div className="space-y-6">
        {locations.map((loc) => {
          const locDevices = devices.filter(d => d.locationId === loc.id).filter(d => {
            const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || d.shortId.toLowerCase().includes(searchQuery.toLowerCase()) || loc.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
            return matchesSearch && matchesStatus;
          });
          const isCollapsed = collapsedLocations[loc.id];
          const locOnlineCount = locDevices.filter(d => d.status === 'online').length;

          return (
            <div key={loc.id} className="bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 rounded-2xl overflow-hidden shadow-2xl transition-all">
              <div onClick={() => toggleLocation(loc.id)} className="p-5 bg-black/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:bg-black/50 transition-colors border-b border-[#2A2A2A]/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#EA580C]/20 text-[#F97316] rounded-xl"><MapPin size={20} /></div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-white">{loc.name}</h3>
                      <span className="text-xs text-gray-400 font-mono bg-black/40 px-2.5 py-1 rounded-md border border-[#2A2A2A]">{loc.address}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                      <span>Подключено экранов: <b className="text-white">{locDevices.length}</b></span>
                      <span>•</span>
                      <span className={locOnlineCount === locDevices.length ? "text-green-400 font-medium" : "text-yellow-400 font-medium"}>
                        {locOnlineCount} из {locDevices.length} в сети
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-[#2A2A2A]/50">
                    <Layers size={14} className="text-[#EA580C]" />
                    <span className="text-xs text-gray-400">Эфир точки:</span>
                    <select onChange={(e) => assignPlaylistToLocation(loc.id, e.target.value || null)} className="bg-transparent text-xs text-white font-medium outline-none cursor-pointer">
                      <option value="" className="bg-[#141414]">-- Назначить всем --</option>
                      {playlists.map(pl => <option key={pl.id} value={pl.id} className="bg-[#141414]">{pl.name}</option>)}
                    </select>
                  </div>
                  <button onClick={() => removeLocation(loc.id)} className="p-2 text-gray-600 hover:text-red-400 transition-colors" title="Удалить точку"><Trash2 size={16} /></button>
                  <div className="p-2 text-gray-400">{isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</div>
                </div>
              </div>

              {!isCollapsed && (
                <div className="p-6">
                  {locDevices.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-[#2A2A2A] rounded-xl">На этой торговой точке пока нет привязанных телевизоров</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {locDevices.map((device) => {
                        const assignedPl = playlists.find(p => p.id === device.assignedPlaylistId);
                        return (
                          <div key={device.id} className="bg-[#0A0A0A]/60 border border-[#2A2A2A]/60 rounded-xl p-5 hover:border-[#F97316]/50 transition-all flex flex-col justify-between relative group">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h4 className="font-bold text-white flex items-center gap-2"><Monitor size={16} className="text-[#EA580C]" /> {device.name}</h4>
                                  <p className="text-xs font-mono text-gray-500 mt-0.5">ID: {device.shortId}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${device.status === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                  {device.status}
                                </span>
                              </div>

                              <div className="space-y-1.5 my-4 text-xs text-gray-400">
                                <div className="flex justify-between"><span>IP-адрес:</span><span className="text-white font-mono">{device.ipAddress}</span></div>
                                <div className="flex justify-between items-center"><span>Память:</span><span className="text-white">{typeof device.storageFree === 'number' ? device.storageFree.toFixed(1) : device.storageFree} ГБ свободно</span></div>
                                <div className="flex justify-between"><span>Версия ОС:</span><span className="text-white">Android {device.androidVersion}</span></div>
                              </div>

                              <div className="bg-black/40 rounded-lg p-2.5 border border-[#2A2A2A]/50 mb-2">
                                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Индивидуальный эфир</label>
                                <select value={device.assignedPlaylistId || ''} onChange={(e) => assignPlaylistToDevice(device.id, e.target.value || null)} className="w-full bg-[#141414] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#EA580C]">
                                  <option value="">-- Отключен (Черный экран) --</option>
                                  {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                                </select>
                              </div>

                              <div className="bg-black/40 rounded-lg p-2.5 border border-[#2A2A2A]/50 mb-2">
                                <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Положение монитора</label>
                                <select value={device.screenRotation || 0} onChange={async (e) => {
                                  const angle = Number(e.target.value) as 0|90|180|270;
                                  const ok = await DeviceService.setRotation(device.shortId, angle);
                                  if (ok) updateDeviceRotation(device.id, angle);
                                }} className="w-full bg-[#141414] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#EA580C]">
                                  <option value={0}>Альбомное (Горизонтально 0°)</option>
                                  <option value={90}>Портретное (Вертикально 90°)</option>
                                  <option value={180}>Перевернутое (Горизонтально 180°)</option>
                                  <option value={270}>Перевернутое (Вертикально 270°)</option>
                                </select>
                              </div>

                              <button disabled={!isOnline} onClick={(e) => {
                                e.stopPropagation();
                                if (assignedPl) {
                                  DeviceService.sendPlaylistToDevice(device, assignedPl, true);
                                  alert(`Эфир отправлен на ${device.name}!`);
                                } else {
                                  alert('Сначала назначьте плейлист устройству');
                                }
                              }} className={`w-full text-xs font-medium py-2 rounded border transition-all flex items-center justify-center gap-2 ${isOnline ? 'bg-white/5 hover:bg-[#EA580C]/20 text-gray-300 hover:text-[#F97316] border-white/5 hover:border-[#EA580C]/30' : 'bg-red-500/10 text-red-500/50 border-red-500/20 cursor-not-allowed'}`}>
                                <RefreshCw size={12} className={!isOnline ? "opacity-50" : ""} /> {isOnline ? 'Синхронизировать с ТВ' : 'Ожидание сети...'}
                              </button>

                              <button disabled={!isOnline || pollingDevice === device.shortId} onClick={(e) => {
                                e.stopPropagation();
                                handleRequestLogs(device.shortId);
                              }} className={`w-full mt-2 text-xs font-medium py-2 rounded border transition-all flex items-center justify-center gap-2 ${isOnline && pollingDevice !== device.shortId ? 'bg-white/5 hover:bg-blue-500/20 text-gray-300 hover:text-blue-400 border-white/5 hover:border-blue-500/30' : 'bg-black/20 text-gray-500 border-[#2A2A2A] cursor-not-allowed'}`}>
                                <FileText size={12} className={!isOnline || pollingDevice === device.shortId ? "opacity-50" : ""} />
                                {pollingDevice === device.shortId ? 'Загрузка логов...' : 'Запросить логи'}
                              </button>
                            </div>

                            <div className="mt-5 pt-3 border-t border-[#2A2A2A]/30 flex justify-between items-center text-xs">
                              <span className="text-gray-500">{assignedPl ? `Файлов: ${assignedPl.items.length}` : 'Эфир пуст'}</span>
                              <button onClick={(e) => {
                                e.stopPropagation();
                                const confirmed = window.confirm(`Точно отвязать ТВ "${device.name}"? Память устройства будет полностью стерта.`);
                                if (confirmed) {
                                  DeviceService.unpairDevice(device.shortId);
                                  removeDevice(device.id);
                                }
                              }} className="text-gray-500 hover:text-red-400 transition-colors font-medium">Отвязать ТВ</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <PairDeviceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* MODAL ДЛЯ ЛОГОВ */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl w-full max-w-3xl h-[70vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-[#2A2A2A] flex justify-between items-center bg-black/40 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="text-blue-400" size={20} /> Системные логи ТВ</h3>
              <button onClick={() => setLogModalOpen(false)} className="text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-lg">&times;</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-green-400 bg-black/90">
              <pre className="whitespace-pre-wrap">{currentLogs}</pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};