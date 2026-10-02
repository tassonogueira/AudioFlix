import React from 'react';
import {
  Download,
  Folder,
  FolderCheck,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Archive,
  FileAudio,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { useDownloadManager, BackgroundDownloadTask } from '../context/DownloadManagerContext.tsx';

export default function DownloadQueueDrawer() {
  const {
    activeDownloads,
    isDrawerOpen,
    setIsDrawerOpen,
    customFolderName,
    selectCustomFolder,
    clearCustomFolder,
    retryDownload,
    cancelDownload,
    clearCompleted
  } = useDownloadManager();

  if (!isDrawerOpen) return null;

  const inProgressCount = activeDownloads.filter(
    (t) => t.status === 'downloading' || t.status === 'queued' || t.status === 'processing'
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Header do Drawer */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Fila de Downloads</span>
                {inProgressCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-mono">
                    {inProgressCount} ativo{inProgressCount > 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Downloads em segundo plano (você pode navegar e ouvir músicas)
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Fechar fila de downloads"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seção de Indicação de Pasta de Destino (Pendrive ou Pasta Específica) */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800/80">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                {customFolderName ? (
                  <FolderCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Folder className="w-4 h-4 text-slate-400" />
                )}
                <span>Pasta de Destino dos Arquivos</span>
              </div>
              {customFolderName && (
                <button
                  onClick={clearCustomFolder}
                  className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                >
                  Restaurar padrão
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                {customFolderName ? (
                  <span className="text-xs text-emerald-400 font-mono font-medium block truncate">
                    📁 {customFolderName}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 block truncate">
                    Padrão (Pasta "Downloads" do seu dispositivo)
                  </span>
                )}
              </div>

              <button
                onClick={selectCustomFolder}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold shrink-0 transition cursor-pointer"
              >
                {customFolderName ? 'Alterar Pasta' : 'Escolher Pasta / Pendrive'}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Downloads */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeDownloads.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <Download className="w-10 h-10 stroke-[1.5] text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">Nenhum download em andamento</p>
              <p className="text-xs max-w-xs text-slate-500">
                Ao baixar qualquer música ou álbum em ZIP, você verá o progresso em tempo real aqui.
              </p>
            </div>
          ) : (
            activeDownloads.map((task) => {
              const isError = task.status === 'error';
              const isCompleted = task.status === 'completed';
              const isCancelled = task.status === 'cancelled';
              const isProcessing = task.status === 'processing';
              const isDownloading = task.status === 'downloading' || task.status === 'queued';

              return (
                <div
                  key={task.id}
                  className={`p-3.5 rounded-xl border transition shadow-sm ${
                    isError
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : isCompleted
                      ? 'bg-slate-950/80 border-emerald-500/30'
                      : 'bg-slate-950/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shrink-0 flex items-center justify-center relative">
                      {task.artwork ? (
                        <img
                          src={task.artwork}
                          alt={task.title}
                          className="w-full h-full object-cover"
                        />
                      ) : task.type.includes('zip') ? (
                        <Archive className="w-5 h-5 text-amber-400" />
                      ) : (
                        <FileAudio className="w-5 h-5 text-emerald-400" />
                      )}
                      {isDownloading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white truncate block" title={task.title}>
                          {task.title}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            isCompleted
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : isError
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {task.type.includes('zip') ? 'ZIP' : 'MP3'}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 block truncate">
                        {task.artist} {task.trackCount ? `• ${task.trackCount} faixas` : ''}
                      </span>

                      {/* Barra de Progresso */}
                      <div className="space-y-1 pt-1">
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isError
                                ? 'bg-rose-500'
                                : isCompleted
                                ? 'bg-emerald-500'
                                : 'bg-emerald-400 animate-pulse'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          <span
                            className={
                              isError
                                ? 'text-rose-400 font-medium'
                                : isCompleted
                                ? 'text-emerald-400 font-medium'
                                : 'text-slate-400'
                            }
                          >
                            {isCompleted
                              ? '✓ Concluído e salvo'
                              : isError
                              ? task.errorMsg || 'Erro no download'
                              : isProcessing
                              ? 'Processando arquivo final...'
                              : `Baixando em segundo plano (${task.progress}%)`}
                          </span>

                          <span className="font-mono text-slate-500 font-semibold">
                            {task.progress}%
                          </span>
                        </div>
                      </div>

                      {/* Botões de Ação para a Tarefa */}
                      {isError && (
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            onClick={() => retryDownload(task.id)}
                            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retomar Download</span>
                          </button>
                        </div>
                      )}

                      {isDownloading && (
                        <div className="pt-1 flex items-center justify-end">
                          <button
                            onClick={() => cancelDownload(task.id)}
                            className="text-[10px] text-slate-500 hover:text-rose-400 transition cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer do Drawer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            onClick={clearCompleted}
            className="text-xs text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar concluídos</span>
          </button>

          <button
            onClick={() => setIsDrawerOpen(false)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
