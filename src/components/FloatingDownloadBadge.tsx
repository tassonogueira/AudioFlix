import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useDownloadManager } from '../context/DownloadManagerContext.tsx';

export default function FloatingDownloadBadge() {
  const { activeDownloads, setIsDrawerOpen, isDrawerOpen } = useDownloadManager();

  const activeTasks = activeDownloads.filter(
    (t) => t.status === 'downloading' || t.status === 'queued' || t.status === 'processing'
  );

  if (activeTasks.length === 0 || isDrawerOpen) return null;

  const currentTask = activeTasks[0];

  return (
    <div className="fixed bottom-24 left-4 z-40 animate-in slide-in-from-bottom-3 duration-300">
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="px-3.5 py-2 rounded-2xl bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/50 border border-emerald-400/40 flex items-center gap-2.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
        title="Ver fila de downloads em segundo plano"
      >
        <div className="relative flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        </div>

        <div className="text-left">
          <div className="flex items-center gap-1.5 text-xs font-bold leading-tight">
            <span>Baixando em 2º plano</span>
            <span className="font-mono bg-emerald-800/80 px-1.5 py-0.2 rounded text-[10px]">
              {currentTask.progress}%
            </span>
          </div>
          <span className="text-[10px] text-emerald-100 max-w-[140px] truncate block opacity-90">
            {currentTask.title}
          </span>
        </div>
      </button>
    </div>
  );
}
