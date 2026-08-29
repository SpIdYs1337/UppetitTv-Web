import { useState, useRef } from 'react';
import { useTvStore, type PlaylistItem } from '../store/tvStore';
import { Image as ImageIcon, Video, Clock, Trash2, MonitorPlay, UploadCloud, Plus, FileVideo, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableMediaItem = ({ 
  item, 
  index, 
  previewIndex, 
  setPreviewIndex, 
  playlistId, 
  updateMediaDuration, 
  removeMediaFromPlaylist 
}: { 
  item: PlaylistItem; 
  index: number; 
  previewIndex: number; 
  setPreviewIndex: (i: number) => void; 
  playlistId: string; 
  updateMediaDuration: (playlistId: string, mediaId: string, duration: number) => void; 
  removeMediaFromPlaylist: (playlistId: string, mediaId: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      onClick={() => setPreviewIndex(index)}
      className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
        isDragging ? 'opacity-70 scale-[1.02] border-[#EA580C] shadow-xl shadow-orange-900/20' : 
        previewIndex === index ? 'border-[#EA580C]/50 bg-[#EA580C]/10 shadow-lg' : 'border-[#2A2A2A]/50 bg-black/20 hover:border-[#404040]/80'
      }`}
    >
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-white transition-colors">
        <GripVertical size={20} />
      </div>

      <div className="w-16 h-16 bg-black rounded-lg overflow-hidden shrink-0 border border-[#2A2A2A]/50 pointer-events-none flex items-center justify-center">
        {item.type === 'video' ? (
          <Video size={24} className="text-gray-500" />
        ) : (
          <img src={item.url} alt={item.name} className="w-full h-full object-cover opacity-90" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{item.name}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            {item.type === 'video' ? <><Video size={12} /> Видео</> : <><ImageIcon size={12} /> Картинка</>}
          </span>
        </div>
      </div>
      
      {item.type === 'image' ? (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Clock size={14} className="text-gray-500" />
          <input 
            type="number" 
            value={item.duration}
            onChange={(e) => updateMediaDuration(playlistId, item.id, Number(e.target.value))}
            className="w-16 bg-black/40 border border-[#2A2A2A]/50 rounded px-2 py-1 text-sm text-center focus:border-[#EA580C] outline-none text-white transition-colors"
          />
          <span className="text-xs text-gray-500">сек</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mr-2">
          <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-1 rounded border border-blue-400/20">
            До конца
          </span>
        </div>
      )}

      <button 
        onClick={(e) => { e.stopPropagation(); removeMediaFromPlaylist(playlistId, item.id); }}
        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-2"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

export const Playlists = () => {
  const { playlists, createPlaylist, deletePlaylist, addMediaToPlaylist, removeMediaFromPlaylist, updateMediaDuration, reorderMediaInPlaylist } = useTvStore();
  
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(playlists[0]?.id || null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [previewRotation, setPreviewRotation] = useState<0 | 90>(0); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePlaylist = playlists.find(p => p.id === activePlaylistId);
  const activePreview = activePlaylist?.items[previewIndex] || null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), 
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && activePlaylist) {
      const oldIndex = activePlaylist.items.findIndex(item => item.id === active.id);
      const newIndex = activePlaylist.items.findIndex(item => item.id === over.id);
      reorderMediaInPlaylist(activePlaylist.id, oldIndex, newIndex);
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName);
    setNewPlaylistName('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activePlaylistId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');

    const reader = new FileReader();
    reader.onload = (event) => {
      const newItem: PlaylistItem = {
        id: `item-${Date.now()}`,
        url: event.target?.result as string,
        type: isVideo ? 'video' : 'image',
        duration: isVideo ? 0 : 10,
        name: file.name
      };
      addMediaToPlaylist(activePlaylistId, newItem);
    };
    reader.readAsDataURL(file);
    
    // Сбрасываем input, чтобы можно было загрузить тот же файл еще раз при необходимости
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-3xl font-bold">Управление контентом</h2>
          <p className="text-gray-400 mt-1">Создавайте плейлисты и загружайте медиа</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        <div className="lg:col-span-3 bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-[#2A2A2A]/50 bg-black/20">
            <h3 className="font-bold mb-3">Мои плейлисты</h3>
            <form onSubmit={handleCreatePlaylist} className="flex gap-2">
              <input 
                type="text" 
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Новый плейлист..."
                className="flex-1 bg-black/40 border border-[#2A2A2A]/50 rounded-lg px-3 py-2 text-sm text-white focus:border-[#EA580C] outline-none"
              />
              <button type="submit" className="bg-[#EA580C] text-white p-2 rounded-lg hover:bg-[#F97316] transition-colors"><Plus size={18} /></button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {playlists.map(pl => (
              <div 
                key={pl.id}
                onClick={() => { setActivePlaylistId(pl.id); setPreviewIndex(0); }}
                className={`flex justify-between items-center p-3 rounded-xl cursor-pointer transition-all ${
                  activePlaylistId === pl.id ? 'bg-[#EA580C]/20 border border-[#EA580C]/50 text-white' : 'hover:bg-white/5 text-gray-400 border border-transparent'
                }`}
              >
                <span className="font-medium flex items-center gap-2 truncate"><FileVideo size={16} /> {pl.name}</span>
                <button onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }} className="text-gray-600 hover:text-red-400"><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#141414]/60 backdrop-blur-xl border border-[#2A2A2A]/50 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          {!activePlaylist ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Выберите или создайте плейлист</div>
          ) : (
            <>
              <div className="p-4 border-b border-[#2A2A2A]/50 flex justify-between items-center bg-black/20">
                <h3 className="font-bold text-[#EA580C]">{activePlaylist.name}</h3>
                <span className="text-sm text-gray-400">Медиа: {activePlaylist.items.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activePlaylist.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {activePlaylist.items.map((item, index) => (
                      <SortableMediaItem 
                        key={item.id} 
                        item={item} 
                        index={index} 
                        previewIndex={previewIndex} 
                        setPreviewIndex={setPreviewIndex} 
                        playlistId={activePlaylist.id}
                        updateMediaDuration={updateMediaDuration}
                        removeMediaFromPlaylist={removeMediaFromPlaylist}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#2A2A2A]/50 bg-black/10 hover:border-[#EA580C]/50 hover:bg-[#EA580C]/5 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:text-[#EA580C] cursor-pointer transition-all mt-4"
                >
                  <UploadCloud size={32} className="mb-2" />
                  <p className="text-sm font-medium">Добавить фото или видео</p>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,video/mp4,video/webm" className="hidden" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live Preview с умной рамкой телевизора */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <MonitorPlay size={18} className="text-[#EA580C]" /> Предпросмотр экрана
            </h3>
            
            {/* Переключатель ориентации */}
            <div className="flex bg-black/40 rounded-lg p-1 border border-[#2A2A2A]/50">
              <button
                onClick={() => setPreviewRotation(0)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${previewRotation === 0 ? 'bg-[#EA580C] text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
              >
                Альбомная
              </button>
              <button
                onClick={() => setPreviewRotation(90)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${previewRotation === 90 ? 'bg-[#EA580C] text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
              >
                Портретная
              </button>
            </div>
          </div>

          <div className="flex-1 bg-[#141414]/60 backdrop-blur-xl rounded-3xl border border-[#2A2A2A]/50 shadow-2xl flex items-center justify-center p-4 min-h-75">
            <div 
              className={`relative bg-black flex items-center justify-center overflow-hidden transition-all duration-500 ease-in-out border-4 border-[#2A2A2A] shadow-inner rounded-xl ${
                previewRotation === 90 ? 'w-[55%] aspect-9/16' : 'w-full aspect-video'
              }`}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10">
                <h1 className="text-4xl font-black">UPPETIT</h1>
              </div>
              {activePreview ? (
                activePreview.type === 'video' ? (
                  <video 
                    src={activePreview.url} 
                    autoPlay 
                    muted 
                    loop
                    className="w-full h-full object-contain relative z-10" 
                  />
                ) : (
                  <img 
                    src={activePreview.url} 
                    alt="Preview" 
                    className="w-full h-full object-contain relative z-10" 
                  />
                )
              ) : (
                <p className="relative z-10 text-gray-600 text-xs font-medium uppercase tracking-wider">Нет медиа</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};