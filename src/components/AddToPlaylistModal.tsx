import React, { useState } from 'react';
import {
  X,
  Plus,
  Check,
  Music,
  Heart,
  ListPlus,
  FolderPlus,
  CheckCircle2
} from 'lucide-react';
import { usePlaylistContext, PlaylistTrack } from '../context/PlaylistContext.tsx';

interface AddToPlaylistModalProps {
  track: PlaylistTrack | null;
  onClose: () => void;
}

export default function AddToPlaylistModal({ track, onClose }: AddToPlaylistModalProps) {
  const {
    playlists,
    createPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    isTrackInPlaylist,
    isFavorite,
    toggleFavorite
  } = usePlaylistContext();

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!track) return null;

  const isFav = isFavorite(track.id);

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const created = createPlaylist(newPlaylistName.trim(), '', [track]);
    setNewPlaylistName('');
    setIsCreating(false);
  };

  const handleTogglePlaylist = (playlistId: string) => {
    if (isTrackInPlaylist(playlistId, track.id)) {
      removeTrackFromPlaylist(playlistId, track.id);
    } else {
      addTrackToPlaylist(playlistId, track);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: '#0e1422' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-extrabold text-base">
            <ListPlus className="w-5 h-5 text-emerald-400" />
            <span>Adicionar à Playlist</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Track Card Preview */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {track.artwork && track.artwork.trim() !== '' ? (
              <img
                src={track.artwork}
                alt={track.title}
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0 shadow-md"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                <Music className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0 truncate">
              <span className="text-sm font-bold text-white block truncate">
                {track.title}
              </span>
              <span className="text-xs text-slate-400 block truncate">
                {track.artist}
              </span>
            </div>
          </div>

          {/* Quick Favorite Button */}
          <button
            onClick={() => toggleFavorite(track)}
            className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer ${
              isFav
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30'
            }`}
            title={isFav ? 'Remover das favoritas' : 'Adicionar às favoritas'}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-current text-rose-500' : ''}`} />
            <span>{isFav ? 'Favorita' : 'Favoritar'}</span>
          </button>
        </div>

        {/* Playlists List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Suas Playlists ({playlists.length})
            </span>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Playlist</span>
              </button>
            )}
          </div>

          {/* Form to create new playlist */}
          {isCreating && (
            <form onSubmit={handleCreateAndAdd} className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Criar Nova Playlist</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Nome (ex: Sertanejo 2026, Churrasco...)"
                  autoFocus
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0 shadow-sm"
                >
                  Criar & Salvar
                </button>
              </div>
            </form>
          )}

          {/* Playlists items */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {playlists.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800">
                Nenhuma playlist criada ainda. Crie uma acima!
              </div>
            ) : (
              playlists.map((pl) => {
                const inList = isTrackInPlaylist(pl.id, track.id);

                return (
                  <div
                    key={pl.id}
                    onClick={() => handleTogglePlaylist(pl.id)}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer group ${
                      inList
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950/60 hover:bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        inList ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-850 text-slate-400'
                      }`}>
                        <Music className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold block truncate group-hover:text-white transition">
                          {pl.name}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'música' : 'músicas'}
                        </span>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition shrink-0 ${
                      inList
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'border border-slate-700 group-hover:border-slate-500'
                    }`}>
                      {inList && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Done Button */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
