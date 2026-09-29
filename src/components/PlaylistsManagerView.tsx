import React, { useState } from 'react';
import {
  Heart,
  ListPlus,
  Play,
  Trash2,
  Edit2,
  Plus,
  Music,
  Download,
  FolderPlus,
  Check,
  X,
  Search,
  ArrowRight,
  Disc,
  Loader2,
  Sparkles
} from 'lucide-react';
import { usePlaylistContext, Playlist, PlaylistTrack } from '../context/PlaylistContext.tsx';
import JSZip from 'jszip';

interface PlaylistsManagerViewProps {
  onPlayTrack: (track: any, playlist?: any[]) => void;
  onExploreSongs: () => void;
}

export default function PlaylistsManagerView({
  onPlayTrack,
  onExploreSongs
}: PlaylistsManagerViewProps) {
  const {
    favorites,
    playlists,
    toggleFavorite,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    removeTrackFromPlaylist
  } = usePlaylistContext();

  const [activeTab, setActiveTab] = useState<'favorites' | 'playlists'>('favorites');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    playlists[0]?.id || null
  );

  // States for creating a playlist
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // States for renaming
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // State for search within favorites/playlists
  const [filterQuery, setFilterQuery] = useState('');

  // State for ZIP download
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const pl = createPlaylist(newTitle.trim(), newDesc.trim());
    setSelectedPlaylistId(pl.id);
    setActiveTab('playlists');
    setNewTitle('');
    setNewDesc('');
    setIsCreatingModal(false);
  };

  const handleStartRename = (pl: Playlist) => {
    setEditingPlaylistId(pl.id);
    setEditTitle(pl.name);
  };

  const handleSaveRename = (plId: string) => {
    if (editTitle.trim()) {
      renamePlaylist(plId, editTitle.trim());
    }
    setEditingPlaylistId(null);
  };

  // Baixar playlist ou favoritas em ZIP
  const handleDownloadZip = async (tracks: PlaylistTrack[], name: string) => {
    if (!tracks || tracks.length === 0) {
      alert('Esta lista não possui músicas para baixar.');
      return;
    }

    setIsZipping(true);
    setZipProgress(5);

    try {
      const zip = new JSZip();
      const folder = zip.folder(name) || zip;

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        setZipProgress(Math.round(((i + 1) / tracks.length) * 85));

        try {
          let audioBlob: Blob | null = null;

          // Se tiver previewUrl tenta baixar
          if (track.previewUrl) {
            const resp = await fetch(track.previewUrl);
            if (resp.ok) {
              audioBlob = await resp.blob();
            }
          }

          // Se não tiver preview direto ou falhou, tenta proxy
          if (!audioBlob) {
            const query = encodeURIComponent(`${track.artist} - ${track.title}`);
            const searchResp = await fetch(`/api/music/search?q=${query}`);
            const searchData = await searchResp.json();
            const candidate = searchData.results?.find((r: any) => r.previewUrl);
            if (candidate?.previewUrl) {
              const resp = await fetch(candidate.previewUrl);
              if (resp.ok) audioBlob = await resp.blob();
            }
          }

          if (audioBlob) {
            const safeName = `${String(i + 1).padStart(2, '0')}. ${track.artist} - ${track.title}.mp3`.replace(/[\/\\:*?"<>|]/g, '_');
            folder.file(safeName, audioBlob);
          }
        } catch (err) {
          console.warn(`Erro ao obter faixa ${track.title}:`, err);
        }
      }

      setZipProgress(95);
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[\/\\:*?"<>|]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (err) {
      console.error('Erro ao gerar ZIP:', err);
      alert('Houve um erro ao gerar o arquivo ZIP da playlist.');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const filteredFavorites = favorites.filter((t) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });

  const filteredPlaylistTracks = (selectedPlaylist?.tracks || []).filter((t) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>Biblioteca Pessoal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
            Favoritas & Playlists
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Organize suas músicas prediletas e crie seleções para ouvir e baixar completas.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsCreatingModal(true)}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Criar Playlist</span>
          </button>

          <button
            onClick={onExploreSongs}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-emerald-400" />
            <span>Buscar Músicas</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'favorites'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-950/40'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Heart className={`w-4 h-4 ${activeTab === 'favorites' ? 'fill-current' : 'text-rose-400'}`} />
          <span>Músicas Favoritas</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-mono ${
            activeTab === 'favorites' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {favorites.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('playlists')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'playlists'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <ListPlus className="w-4 h-4 text-emerald-400" />
          <span>Minhas Playlists</span>
          <span className={`px-2 py-0.2 rounded-full text-xs font-mono ${
            activeTab === 'playlists' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {playlists.length}
          </span>
        </button>
      </div>

      {/* SEARCH WITHIN PLAYLIST / FAVORITES */}
      {((activeTab === 'favorites' && favorites.length > 3) || (activeTab === 'playlists' && (selectedPlaylist?.tracks?.length || 0) > 3)) && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filtrar faixas na lista..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* TAB 1: FAVORITAS */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          {favorites.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-4 max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <Heart className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  Nenhuma música favorita ainda
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Clique no ícone de coração ❤️ em qualquer música, álbum ou clipe do AudioFlix para salvar aqui.
                </p>
              </div>
              <button
                onClick={onExploreSongs}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Explorar e Favoritar Músicas</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
              {/* Action bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-rose-500 fill-current" />
                    <span>Todas as Suas Favoritas ({favorites.length})</span>
                  </h2>
                  <span className="text-xs text-slate-400">
                    Músicas salvas prontas para tocar ou baixar completas
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onPlayTrack(favorites[0], favorites)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Tocar Todas</span>
                  </button>

                  <button
                    onClick={() => handleDownloadZip(favorites, 'Minhas Músicas Favoritas')}
                    disabled={isZipping}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Baixar ZIP ({favorites.length})</span>
                  </button>
                </div>
              </div>

              {/* Tracks List */}
              <div className="divide-y divide-slate-800/60">
                {filteredFavorites.map((track, idx) => (
                  <div
                    key={track.id}
                    className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-800/40 rounded-xl transition group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-slate-500 w-5 text-center shrink-0">
                        {idx + 1}
                      </span>

                      {track.artwork ? (
                        <img
                          src={track.artwork}
                          alt={track.title}
                          className="w-11 h-11 rounded-xl object-cover bg-slate-800 shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                          <Music className="w-5 h-5" />
                        </div>
                      )}

                      <div className="truncate">
                        <span className="text-xs sm:text-sm font-bold text-white block truncate group-hover:text-emerald-400 transition">
                          {track.title}
                        </span>
                        <span className="text-[11px] text-slate-400 block truncate">
                          {track.artist} {track.album ? `• ${track.album}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onPlayTrack(track, favorites)}
                        className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition shadow-sm cursor-pointer"
                        title="Tocar música completa"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </button>

                      <button
                        onClick={() => toggleFavorite(track)}
                        className="p-2 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Remover das favoritas"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MINHAS PLAYLISTS */}
      {activeTab === 'playlists' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Lista das Playlists Criadas */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Suas Playlists ({playlists.length})
              </span>
              <button
                onClick={() => setIsCreatingModal(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova</span>
              </button>
            </div>

            <div className="space-y-2">
              {playlists.map((pl) => {
                const isSelected = selectedPlaylist?.id === pl.id;

                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer group ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md'
                        : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {pl.coverUrl ? (
                        <img
                          src={pl.coverUrl}
                          alt={pl.name}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                          <Disc className="w-6 h-6" />
                        </div>
                      )}

                      <div className="truncate">
                        <span className={`text-xs sm:text-sm font-bold block truncate ${
                          isSelected ? 'text-emerald-300' : 'text-white'
                        }`}>
                          {pl.name}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'música' : 'músicas'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {pl.tracks.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayTrack(pl.tracks[0], pl.tracks);
                          }}
                          className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition shadow-sm cursor-pointer"
                          title="Tocar playlist completa"
                        >
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna 2: Detalhes e Faixas da Playlist Selecionada */}
          <div className="lg:col-span-2">
            {selectedPlaylist ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
                {/* Header da Playlist Selecionada */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    {selectedPlaylist.coverUrl ? (
                      <img
                        src={selectedPlaylist.coverUrl}
                        alt={selectedPlaylist.name}
                        className="w-16 h-16 rounded-2xl object-cover bg-slate-800 shrink-0 shadow-md"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                        <ListPlus className="w-8 h-8" />
                      </div>
                    )}

                    <div>
                      {editingPlaylistId === selectedPlaylist.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            autoFocus
                            className="bg-slate-950 border border-emerald-500 rounded-lg px-2.5 py-1 text-sm font-bold text-white focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRename(selectedPlaylist.id)}
                            className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingPlaylistId(null)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-white">
                            {selectedPlaylist.name}
                          </h2>
                          <button
                            onClick={() => handleStartRename(selectedPlaylist)}
                            className="p-1 text-slate-500 hover:text-slate-300 rounded transition"
                            title="Renomear playlist"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <span className="text-xs text-slate-400 block mt-0.5">
                        {selectedPlaylist.tracks.length} faixas adicionadas
                        {selectedPlaylist.description ? ` • ${selectedPlaylist.description}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {selectedPlaylist.tracks.length > 0 && (
                      <>
                        <button
                          onClick={() => onPlayTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Tocar</span>
                        </button>

                        <button
                          onClick={() => handleDownloadZip(selectedPlaylist.tracks, selectedPlaylist.name)}
                          disabled={isZipping}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Baixar todas em ZIP"
                        >
                          {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">Baixar ZIP</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        if (confirm(`Excluir a playlist "${selectedPlaylist.name}"?`)) {
                          deletePlaylist(selectedPlaylist.id);
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
                      title="Excluir playlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Lista de Músicas da Playlist */}
                {selectedPlaylist.tracks.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <Music className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Esta playlist está vazia. Pesquise suas músicas preferidas e adicione-as clicando no botão de playlist.
                    </p>
                    <button
                      onClick={onExploreSongs}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Buscar e Adicionar Músicas</span>
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {filteredPlaylistTracks.map((track, idx) => (
                      <div
                        key={`${track.id}-${idx}`}
                        className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-800/40 rounded-xl transition group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono text-slate-500 w-5 text-center shrink-0">
                            {idx + 1}
                          </span>

                          {track.artwork ? (
                            <img
                              src={track.artwork}
                              alt={track.title}
                              className="w-10 h-10 rounded-xl object-cover bg-slate-800 shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                              <Music className="w-5 h-5" />
                            </div>
                          )}

                          <div className="truncate">
                            <span className="text-xs sm:text-sm font-bold text-white block truncate group-hover:text-emerald-400 transition">
                              {track.title}
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              {track.artist}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => onPlayTrack(track, selectedPlaylist.tracks)}
                            className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition shadow-sm cursor-pointer"
                            title="Tocar música"
                          >
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </button>

                          <button
                            onClick={() => removeTrackFromPlaylist(selectedPlaylist.id, track.id)}
                            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                            title="Remover desta playlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL CRIAR NOVA PLAYLIST */}
      {isCreatingModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsCreatingModal(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: '#0e1422' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-extrabold text-base">
                <FolderPlus className="w-5 h-5 text-emerald-400" />
                <span>Nova Playlist</span>
              </div>
              <button
                onClick={() => setIsCreatingModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Nome da Playlist <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Melhores do Sertanejo, Viagem, Churrasco..."
                  required
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Ex: As faixas que mais tocam no meu carro"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md"
                >
                  Criar Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
