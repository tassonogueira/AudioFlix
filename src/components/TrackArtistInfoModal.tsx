import React, { useState, useEffect } from 'react';
import {
  X,
  Music,
  User,
  Disc,
  Clock,
  Sparkles,
  Download,
  ListPlus,
  Heart,
  Search,
  Check,
  Copy,
  ShieldCheck,
  Headphones,
  Radio,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { PlayerTrack } from './AudioFlixPlayer.tsx';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';
import { DownloadTrackInfo } from './DownloadFullTrackModal.tsx';

interface ArtistDetails {
  id?: string | number | null;
  name: string;
  genre?: string;
  avatar?: string;
  bio?: string;
  topSongs?: Array<{ title: string; album?: string; year?: string }>;
}

interface TrackArtistInfoModalProps {
  track: PlayerTrack;
  currentTime?: number;
  duration?: number;
  onClose: () => void;
  onSearchArtist?: (artistName: string) => void;
  onOpenDownloadModal?: (track: DownloadTrackInfo) => void;
  onAddToQueue?: (track: PlayerTrack) => void;
}

export default function TrackArtistInfoModal({
  track,
  currentTime = 0,
  duration,
  onClose,
  onSearchArtist,
  onOpenDownloadModal,
  onAddToQueue
}: TrackArtistInfoModalProps) {
  const { isFavorite, toggleFavorite, openAddToPlaylistModal, showToast } = usePlaylistContext();

  const [artistDetails, setArtistDetails] = useState<ArtistDetails | null>(null);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [isQueued, setIsQueued] = useState<boolean>(false);

  const isFav = isFavorite(track.id);

  // Busca detalhes e biografia do artista na API
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingArtist(true);

    const cleanArtist = track.artist.replace(/feat\..*|ft\..*|,.*|&.*/i, '').trim();

    fetch(`/api/music/artist-info?name=${encodeURIComponent(cleanArtist || track.artist)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Não foi possível obter dados do artista');
        return res.json();
      })
      .then((data) => {
        if (!isCancelled && data.artist) {
          setArtistDetails(data.artist);
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar detalhes do artista:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingArtist(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [track.artist]);

  // Formatação de segundos
  const formatTime = (sec?: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCopy = () => {
    const textToCopy = `${track.title} - ${track.artist}${track.album ? ` (${track.album})` : ''}`;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    showToast('📋 Informações da música copiadas para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQueueTrack = () => {
    if (onAddToQueue) {
      onAddToQueue(track);
      setIsQueued(true);
      showToast(`🎵 "${track.title}" adicionada à fila de reprodução!`);
      setTimeout(() => setIsQueued(false), 2500);
    }
  };

  const handleSearchThisArtist = () => {
    if (onSearchArtist) {
      onSearchArtist(track.artist);
      onClose();
    }
  };

  const effectiveDuration = duration || track.durationSeconds || 0;
  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                Detalhes da Música & Artista
              </h2>
              <span className="text-[11px] text-emerald-400 font-medium">
                Reprodução Ativa • Áudio Completo
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL SCROLLÁVEL */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 no-scrollbar">
          {/* SEÇÃO PRINCIPAL: CAPA + DADOS DA FAIXA */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 bg-slate-950/50 p-4 sm:p-5 rounded-2xl border border-slate-800/80">
            {/* Capa em Alta Resolução */}
            <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700 shadow-xl shrink-0 relative group">
              {track.artwork ? (
                <img
                  src={track.artwork}
                  alt={track.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-950">
                  <Music className="w-12 h-12" />
                </div>
              )}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                <span>No Ar</span>
              </div>
            </div>

            {/* Metadados da Música */}
            <div className="flex-1 text-center sm:text-left min-w-0 space-y-2">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                <span>Fidelidade 320 kbps • 48 kHz</span>
              </div>

              <h3 className="text-lg sm:text-xl font-black text-white leading-tight break-words">
                {track.title}
              </h3>

              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-300 font-semibold text-sm">
                <User className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{track.artist}</span>
              </div>

              {track.album && (
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-400 text-xs">
                  <Disc className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">{track.album}</span>
                </div>
              )}

              {/* Barra de Progresso e Duração */}
              <div className="pt-2 space-y-1.5 max-w-xs mx-auto sm:mx-0">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(effectiveDuration)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BARRA DE AÇÕES RÁPIDAS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Pesquisar Artista */}
            {onSearchArtist && (
              <button
                type="button"
                onClick={handleSearchThisArtist}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group"
              >
                <Search className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-semibold leading-tight">Discografia</span>
              </button>
            )}

            {/* Adicionar à Fila */}
            <button
              type="button"
              onClick={handleQueueTrack}
              className={`p-2.5 rounded-xl border transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group ${
                isQueued
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isQueued ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <ListPlus className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[11px] font-semibold leading-tight">
                {isQueued ? 'Na Fila' : '+ Fila'}
              </span>
            </button>

            {/* Favoritar */}
            <button
              type="button"
              onClick={() => toggleFavorite(track as any)}
              className={`p-2.5 rounded-xl border transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group ${
                isFav
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Heart
                className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                  isFav ? 'fill-rose-400 text-rose-400' : 'text-slate-400'
                }`}
              />
              <span className="text-[11px] font-semibold leading-tight">
                {isFav ? 'Favoritada' : 'Favoritar'}
              </span>
            </button>

            {/* Baixar MP3 */}
            {onOpenDownloadModal && (
              <button
                type="button"
                onClick={() => {
                  onOpenDownloadModal({
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    artwork: track.artwork,
                    durationSeconds: effectiveDuration,
                    youtubeId: track.youtubeId,
                    previewUrl: track.previewUrl
                  });
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer group shadow-md shadow-emerald-950/50"
              >
                <Download className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-bold leading-tight">Baixar MP3</span>
              </button>
            )}
          </div>

          {/* SEÇÃO INFORMAÇÕES DO ARTISTA / BIOGRAFIA */}
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Sobre o Artista: {track.artist}
                </h4>
              </div>

              {artistDetails?.genre && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-medium text-slate-300 border border-slate-700">
                  {artistDetails.genre}
                </span>
              )}
            </div>

            {isLoadingArtist ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                <span className="text-xs">Consultando dados do artista...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto pr-1">
                  {artistDetails?.bio ||
                    `${track.artist} é destaque na música com composições e faixas de grande alcance e popularidade.`}
                </p>

                {onSearchArtist && (
                  <button
                    type="button"
                    onClick={handleSearchThisArtist}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ver todos os álbuns e músicas de {track.artist}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* DADOS TÉCNICOS & BOTÃO COPIAR */}
          <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-emerald-400" />
              <span>
                {track.album ? `Álbum: ${track.album}` : 'Faixa Oficial'} • {formatTime(effectiveDuration)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Copiar dados"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px] text-slate-500">
            Dica: Clique no botão Discografia para explorar todas as músicas do artista.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
