// src/components/OfflineBanner.tsx
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export const OfflineBanner = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-red-500/90 backdrop-blur-md text-white px-4 py-3 flex items-center justify-center gap-3 shadow-2xl border-b border-red-600">
      <WifiOff size={20} className="animate-pulse" />
      <span className="font-medium text-sm">
        Нет подключения к интернету. Редактирование и синхронизация приостановлены до восстановления связи.
      </span>
    </div>
  );
};