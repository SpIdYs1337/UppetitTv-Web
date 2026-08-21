// src/components/tv/PairDeviceModal.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTvStore } from '../../store/tvStore';

const pairSchema = z.object({
  shortId: z.string()
    .length(7, "Формат: 3 символа, пробел, 3 символа")
    .regex(/^[A-Z0-9]{3} [A-Z0-9]{3}$/, "Пример: A8K 2M9"),
  locationId: z.string().min(1, "Выберите торговую точку"),
  deviceName: z.string().min(2, "Введите название экрана"),
});

type PairInputs = z.infer<typeof pairSchema>;

interface PairDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PairDeviceModal = ({ isOpen, onClose }: PairDeviceModalProps) => {
  const { locations, addDevice } = useTvStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PairInputs>({
    resolver: zodResolver(pairSchema),
  });

  if (!isOpen) return null;

  const onSubmit = (data: PairInputs) => {
    addDevice({
      shortId: data.shortId, // В стор уходит уже отформатированная строка
      name: data.deviceName,
      locationId: data.locationId,
    });
    reset();
    onClose();
  };

  // Автоматический форматер (Маска) для поля Short ID
  const handleShortIdInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 1. Убираем всё, кроме английских букв и цифр, переводим в верхний регистр
    let val = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    // 2. Обрезаем чистую длину до 6 символов
    val = val.slice(0, 6);
    
    // 3. Автоматически вставляем пробел, если введено больше 3 символов
    if (val.length > 3) {
      e.target.value = `${val.slice(0, 3)} ${val.slice(3)}`;
    } else {
      e.target.value = val;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="max-w-md w-full bg-[#141414]/90 border border-[#2A2A2A] rounded-2xl p-8 shadow-2xl relative backdrop-blur-xl">
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white">Привязать ТВ</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Код с экрана ТВ (Short ID)</label>
            <input
              type="text"
              {...register('shortId', {
                onChange: handleShortIdInput // Подключаем нашу маску
              })}
              className="w-full bg-black/50 border border-[#2A2A2A] rounded-xl px-4 py-3 text-white font-mono text-center tracking-widest uppercase focus:border-[#F97316] outline-none"
              placeholder="A8K 2M9"
              maxLength={7}
            />
            {errors.shortId && <p className="mt-1 text-xs text-red-500">{errors.shortId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Торговая точка</label>
            <select
              {...register('locationId')}
              className="w-full bg-black/50 border border-[#2A2A2A] rounded-xl px-4 py-3 text-white focus:border-[#F97316] outline-none cursor-pointer"
            >
              <option value="">-- Выберите точку --</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.address})</option>
              ))}
            </select>
            {errors.locationId && <p className="mt-1 text-xs text-red-500">{errors.locationId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Название устройства</label>
            <input
              type="text"
              {...register('deviceName')}
              className="w-full bg-black/50 border border-[#2A2A2A] rounded-xl px-4 py-3 text-white focus:border-[#F97316] outline-none"
              placeholder="Например: Экран над кассой №1"
            />
            {errors.deviceName && <p className="mt-1 text-xs text-red-500">{errors.deviceName.message}</p>}
          </div>

          <div className="flex gap-3 mt-8">
            <button type="button" onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-colors border border-white/5">
              Отмена
            </button>
            <button type="submit" className="flex-1 bg-[#EA580C] hover:bg-[#F97316] text-white font-semibold py-3 rounded-xl transition-colors">
              Привязать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};