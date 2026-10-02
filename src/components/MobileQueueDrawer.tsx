import React, { useState } from 'react';
import {
  ListMusic,
  X,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Music,
  Plus,
  Save,
  Check,
  Disc3,
  Shuffle
} from 'lucide-react';
import { usePlaylistContext, PlaylistTrack } from '../context/PlaylistContext.tsx';
import { PlayerTrack } from './AudioFlixPlayer.tsx';

interface MobileQueueDrawerProps {
  currentTrack: PlayerTrack | null;
  onPlayTrack: (track: PlayerTrack) => void;
}

export default function MobileQueueDrawer({
  currentTrack,
  onPlayTrack
}: MobileQueueDrawerProps) {
  const {
    queue,
    isQueueOpen,
    setIsQueueOpen,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    saveQueueAsPlaylist,
    showToast
  } = usePlaylistContext();

  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  if (!isQueueOpen) return null;

  const handleSavePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    saveQueueAsPlaylist(playlistName.trim());
    setPlaylistName('');
    setIsSavingPlaylist(false);
  };

  const formatSeconds = (sec?: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Fila de Reprodução</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {queue.length}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Organize e reordene seus próximos vídeos e músicas
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsQueueOpen(false)}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Fechar fila"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Faixa Tocando Agora */}
        {currentTrack && (
          <div className="p-4 bg-emerald-950/30 border-b border-emerald-500/20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-2">
              Tocando Agora
            </span>
            <div className="flex items-center gap-3 bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/30">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative">
                {currentTrack.artwork && currentTrack.artwork.trim() !== '' ? (
                  <img
                    src={currentTrack.artwork}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Music className="w-5 h-5" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="flex items-center gap-0.5">
                    <span className="w-0.5 bg-emerald-400 h-2 animate-[pulse_0.6s_infinite]" />
                    <span className="w-0.5 bg-emerald-400 h-3.5 animate-[pulse_0.9s_infinite]" />
                    <span className="w-0.5 bg-emerald-400 h-2 animate-[pulse_0.7s_infinite]" />
                  </div>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-bold text-white truncate block">
                  {currentTrack.title}
                </span>
                <span className="text-[11px] text-slate-400 truncate block">
                  {currentTrack.artist}
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400/80 shrink-0">
                {formatSeconds(currentTrack.durationSeconds)}
              </span>
            </div>
          </div>
        )}

        {/* Barra de Ações da Fila (Limpar / Salvar como Playlist) */}
        <div className="p-3 px-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-400">
            Próximos na Fila ({queue.length})
          </span>

          <div className="flex items-center gap-1.5">
            {queue.length > 0 && !isSavingPlaylist && (
              <>
                <button
                  onClick={() => setIsSavingPlaylist(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                  title="Salvar esta fila como uma nova playlist"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Salvar Playlist</span>
                </button>
                <button
                  onClick={clearQueue}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                  title="Limpar todos os itens da fila"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Limpar</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Formulário Inline de Salvar Fila como Playlist */}
        {isSavingPlaylist && (
          <form onSubmit={handleSavePlaylist} className="p-3 bg-slate-950 border-b border-emerald-500/30 flex items-center gap-2">
            <input
              type="text"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="Nome da nova playlist..."
              autoFocus
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSavingPlaylist(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Lista de Músicas na Fila com Reordenação Touch-Friendly */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
              <Disc3 className="w-10 h-10 stroke-1 text-slate-600 animate-spin" style={{ animationDuration: '8s' }} />
              <p className="text-sm font-semibold text-slate-400">Sua fila de reprodução está vazia</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Toque em "Adicionar à Fila" ou "Tocar a Seguir" em qualquer música ou vídeo para montar sua lista temporária no celular.
              </p>
            </div>
          ) : (
            queue.map((track, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === queue.length - 1;

              return (
                <div
                  key={`${track.id}-${idx}`}
                  className="group bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-2.5 flex items-center justify-between gap-2.5 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Botões de Mover para Cima/Baixo direto no Celular */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => reorderQueue(idx, idx - 1)}
                        disabled={isFirst}
                        className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-20 hover:bg-slate-800 transition"
                        title="Subir posição na fila"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => reorderQueue(idx, idx + 1)}
                        disabled={isLast}
                        className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-20 hover:bg-slate-800 transition"
                        title="Descer posição na fila"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative">
                      {track.artwork && track.artwork.trim() !== '' ? (
                        <img
                          src={track.artwork}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Music className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-200 block truncate" title={track.title}>
                        {track.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        {track.artist}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                      {formatSeconds(track.durationSeconds)}
                    </span>

                    {/* Tocar Agora */}
                    <button
                      onClick={() => {
                        onPlayTrack(track);
                        removeFromQueue(idx);
                      }}
                      className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 transition cursor-pointer"
                      title="Tocar agora"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>

                    {/* Remover da Fila */}
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                      title="Remover da fila"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé explicativo */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500">
            Fila persistida localmente • Próximas músicas tocam continuamente em segundo plano com a tela apagada.
          </p>
        </div>

      </div>
    </div>
  );
}
