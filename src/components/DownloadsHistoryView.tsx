import React, { useState } from 'react';
import {
  Download,
  Trash2,
  Play,
  FileAudio,
  Archive,
  CheckCircle2,
  FolderCheck,
  Search,
  ArrowRight,
  Music,
  Clock,
  Sparkles,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { usePlaylistContext, DownloadHistoryItem } from '../context/PlaylistContext.tsx';
import { PlayerTrack } from './AudioFlixPlayer.tsx';

interface DownloadsHistoryViewProps {
  onPlayTrack: (track: PlayerTrack) => void;
  onExploreSongs: () => void;
}

export default function DownloadsHistoryView({
  onPlayTrack,
  onExploreSongs
}: DownloadsHistoryViewProps) {
  const { downloads, removeDownloadRecord, clearDownloadHistory, showToast } = usePlaylistContext();

  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'single_mp3' | 'zip'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredDownloads = downloads.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.artist.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.fileName.toLowerCase().includes(searchFilter.toLowerCase());

    if (!matchesSearch) return false;

    if (typeFilter === 'single_mp3') return item.type === 'single_mp3';
    if (typeFilter === 'zip') return item.type === 'album_zip' || item.type === 'singles_zip';
    return true;
  });

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleReDownload = async (item: DownloadHistoryItem) => {
    setDownloadingId(item.id);
    try {
      let downloadEndpoint = '';
      if (item.youtubeId) {
        downloadEndpoint = `/api/youtube/download?id=${encodeURIComponent(item.youtubeId)}&title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`;
      } else {
        downloadEndpoint = `/api/music/download-full-track?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`;
      }

      const response = await fetch(downloadEndpoint);
      if (!response.ok) {
        throw new Error('Falha ao baixar novamente');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName || `${item.artist} - ${item.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 20000);

      showToast(`Download de "${item.title}" iniciado no seu dispositivo!`);
    } catch (err) {
      console.error('Erro ao baixar novamente:', err);
      // Fallback direto
      const directUrl = `/api/music/download-full-track?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}&youtubeId=${encodeURIComponent(item.youtubeId || '')}`;
      const link = document.createElement('a');
      link.href = directUrl;
      link.download = item.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Download iniciado no seu dispositivo.`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <HardDrive className="w-3 h-3" />
                <span>Arquivos Salvos no Dispositivo</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Meus Downloads ({downloads.length})
              </h2>
            </div>
          </div>

          {downloads.length > 0 && (
            <button
              onClick={clearDownloadHistory}
              className="self-start sm:self-auto px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800/40 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              title="Limpar lista do histórico"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Histórico</span>
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-3xl">
          Aqui estão registradas as músicas e álbuns baixados 100% completos no seu computador ou celular. Os arquivos ficam guardados na pasta padrão de Downloads do seu dispositivo e podem ser ouvidos diretamente aqui ou baixados novamente com 1 clique.
        </p>

        {/* Filtros e Barra de Pesquisa */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar por nome de música, artista ou arquivo..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                typeFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({downloads.length})
            </button>
            <button
              onClick={() => setTypeFilter('single_mp3')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                typeFilter === 'single_mp3'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Faixas MP3 ({downloads.filter((d) => d.type === 'single_mp3').length})
            </button>
            <button
              onClick={() => setTypeFilter('zip')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                typeFilter === 'zip'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Álbuns ZIP ({downloads.filter((d) => d.type === 'album_zip' || d.type === 'singles_zip').length})
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Arquivos Baixados */}
      {filteredDownloads.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto text-slate-500">
            <Download className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {downloads.length === 0 ? 'Nenhum download realizado ainda' : 'Nenhum arquivo encontrado com esse filtro'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              Explore discografias, álbuns e músicas completas. Quando você baixar faixas em MP3 ou álbuns em ZIP, elas aparecerão aqui!
            </p>
          </div>
          <button
            onClick={onExploreSongs}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            <Music className="w-4 h-4" />
            <span>Buscar Músicas para Baixar</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredDownloads.map((item) => {
            const isZip = item.type === 'album_zip' || item.type === 'singles_zip';
            const isDownloadingThis = downloadingId === item.id;

            return (
              <div
                key={item.id}
                className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 transition group shadow-sm"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Capa ou Ícone */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative flex items-center justify-center">
                    {item.artwork ? (
                      <img
                        src={item.artwork}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : isZip ? (
                      <Archive className="w-6 h-6 text-amber-400" />
                    ) : (
                      <FileAudio className="w-6 h-6 text-emerald-400" />
                    )}
                  </div>

                  {/* Informações */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-white truncate block" title={item.title}>
                        {item.title}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                          isZip
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {isZip ? 'ZIP Álbum' : 'MP3 100%'}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400 truncate block">
                      {item.artist} {item.album ? `• ${item.album}` : ''}
                    </span>

                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formatDate(item.downloadedAt)}</span>
                      </span>
                      {item.fileSizeStr && (
                        <>
                          <span>•</span>
                          <span>{item.fileSizeStr}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações: Tocar, Baixar Novamente, Remover */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Tocar no Player se for faixa */}
                  {!isZip && (
                    <button
                      onClick={() =>
                        onPlayTrack({
                          id: item.youtubeId || item.id,
                          title: item.title,
                          artist: item.artist,
                          album: item.album,
                          artwork: item.artwork,
                          durationSeconds: item.durationSeconds,
                          youtubeId: item.youtubeId
                        })
                      }
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title="Ouvir no reprodutor com reprodução em segundo plano"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">Ouvir</span>
                    </button>
                  )}

                  {/* Baixar Novamente para o dispositivo */}
                  <button
                    onClick={() => handleReDownload(item)}
                    disabled={isDownloadingThis}
                    className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition cursor-pointer disabled:opacity-50"
                    title="Baixar este arquivo novamente para o dispositivo"
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingThis ? 'animate-bounce text-emerald-400' : ''}`} />
                  </button>

                  {/* Remover do histórico */}
                  <button
                    onClick={() => removeDownloadRecord(item.id)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-slate-950 transition cursor-pointer"
                    title="Remover do histórico"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
