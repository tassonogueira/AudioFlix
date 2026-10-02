import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600/95 text-white py-2 px-4 shadow-lg backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top flex items-center justify-between text-xs sm:text-sm font-semibold">
      <div className="flex items-center gap-2 max-w-4xl mx-auto">
        <WifiOff className="w-4 h-4 animate-pulse shrink-0 text-amber-200" />
        <span>
          Sem conexão com a internet. Verifique sua rede móvel ou Wi-Fi para buscar e baixar músicas.
        </span>
      </div>

      <button
        onClick={() => {
          if (navigator.onLine) setIsOnline(true);
        }}
        className="px-2.5 py-1 bg-amber-800/60 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        <span className="hidden sm:inline">Verificar</span>
      </button>
    </div>
  );
}
