import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Maximize2,
  Minimize2,
  Download,
  X,
  Music,
  Tv,
  CheckCircle2,
  Sparkles,
  Loader2,
  Heart,
  ListPlus,
  PictureInPicture2,
  ListMusic,
  Move,
  Layers,
  ShieldCheck,
  Disc3,
  Video
} from 'lucide-react';
import DownloadFullTrackModal, { DownloadTrackInfo } from './DownloadFullTrackModal.tsx';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';

export interface PlayerTrack {
  id: string | number;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSeconds?: number;
  youtubeId?: string;
  previewUrl?: string;
}

interface AudioFlixPlayerProps {
  currentTrack: PlayerTrack | null;
  playlist?: PlayerTrack[];
  onTrackChange?: (track: PlayerTrack) => void;
  onClose?: () => void;
  onAddToLocalRepair?: (file: { name: string; blob?: Blob }) => void;
}

export default function AudioFlixPlayer({
  currentTrack,
  playlist = [],
  onTrackChange,
  onClose,
  onAddToLocalRepair
}: AudioFlixPlayerProps) {
  if (!currentTrack) return null;

  const [isPlaying, setIsPlaying] = useState(true);
  const [isAudioBuffering, setIsAudioBuffering] = useState(true);
  const [hasAudioStarted, setHasAudioStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(currentTrack.durationSeconds || 180);
  const [resolvedVideoId, setResolvedVideoId] = useState<string | null>(currentTrack.youtubeId || null);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [showVideoDrawer, setShowVideoDrawer] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isFloatingMiniPlayer, setIsFloatingMiniPlayer] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const getStreamUrl = (track: PlayerTrack) =>
    `/api/music/stream-audio?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&youtubeId=${encodeURIComponent(track.youtubeId || '')}`;

  const [audioSource, setAudioSource] = useState<string | null>(() =>
    currentTrack ? getStreamUrl(currentTrack) : null
  );

  const {
    isFavorite,
    toggleFavorite,
    openAddToPlaylistModal,
    queue,
    favorites,
    isQueueOpen,
    setIsQueueOpen,
    removeFromQueue,
    showToast
  } = usePlaylistContext();

  const isFav = isFavorite(currentTrack.id);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Formatar segundos em mm:ss
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Gerenciamento de WakeLock API (Impede tela de desligar e suspender abas durante reprodução)
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        }
      }
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {}
  }, []);

  // Web Audio API Keep-Alive Context (Garante que dispositivos móveis não congelem o thread de som em tela bloqueada)
  const initWebAudioKeepAlive = useCallback(() => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtxClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (err) {
      console.warn('Web Audio Keep-Alive aviso:', err);
    }
  }, []);

  // Pular para o próximo na lista de reprodução, fila ou favoritas
  const handleNext = useCallback(() => {
    // 1. Prioriza a Fila Temporária se houver itens
    if (queue && queue.length > 0) {
      const nextQueueTrack = queue[0];
      removeFromQueue(0);
      if (onTrackChange) {
        onTrackChange({
          id: nextQueueTrack.id,
          title: nextQueueTrack.title,
          artist: nextQueueTrack.artist,
          album: nextQueueTrack.album,
          artwork: nextQueueTrack.artwork,
          durationSeconds: nextQueueTrack.durationSeconds,
          youtubeId: nextQueueTrack.youtubeId,
          previewUrl: nextQueueTrack.previewUrl
        });
        return;
      }
    }

    // 2. Quando não houver músicas na fila, toca as músicas favoritas!
    if (favorites && favorites.length > 0 && onTrackChange) {
      const favIndex = favorites.findIndex((f) => String(f.id) === String(currentTrack.id));
      if (favIndex >= 0 && favIndex < favorites.length - 1) {
        onTrackChange(favorites[favIndex + 1]);
        return;
      } else {
        // Se a atual não estiver nas favoritas ou for a última, toca a primeira favorita
        onTrackChange(favorites[0]);
        return;
      }
    }

    // 3. Fallback para playlist atual se não houver favoritas
    if (!playlist || playlist.length === 0 || !onTrackChange) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      onTrackChange(playlist[currentIndex + 1]);
    } else if (playlist.length > 0) {
      onTrackChange(playlist[0]);
    }
  }, [queue, favorites, playlist, onTrackChange, currentTrack.id, removeFromQueue]);

  // Voltar para o anterior na lista de reprodução
  const handlePrev = useCallback(() => {
    if (currentTime > 4) {
      handleSeek(0);
      return;
    }
    if (!playlist || playlist.length === 0 || !onTrackChange) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      onTrackChange(playlist[currentIndex - 1]);
    } else if (playlist.length > 0) {
      onTrackChange(playlist[playlist.length - 1]);
    }
  }, [currentTime, playlist, onTrackChange, currentTrack.id]);

  // Mudar posição do cursor de reprodução (Scrubbing milimétrico)
  const handleSeek = (newSeconds: number) => {
    setCurrentTime(newSeconds);
    if (audioRef.current) {
      audioRef.current.currentTime = newSeconds;
    }
    // Sincroniza o clipe de vídeo se estiver aberto
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [newSeconds, true] }),
        '*'
      );
    }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, duration),
          playbackRate: isPlaying ? 1 : 0,
          position: Math.min(newSeconds, duration)
        });
      } catch {}
    }
  };

  // Controles de Play / Pause
  const togglePlay = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);

    if (audioRef.current) {
      if (nextState) {
        audioRef.current.play().catch(() => {});
        requestWakeLock();
        initWebAudioKeepAlive();
      } else {
        audioRef.current.pause();
        releaseWakeLock();
      }
    }

    if (iframeRef.current?.contentWindow) {
      const command = nextState
        ? JSON.stringify({ event: 'command', func: 'playVideo', args: [] })
        : JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });
      iframeRef.current.contentWindow.postMessage(command, '*');
    }
  };

  // Atualiza volume no elemento de áudio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Suporte Avançado à Media Session API (Reprodução Contínua em Segundo Plano e Tela Bloqueada)
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'AudioFlix',
        artwork: currentTrack.artwork
          ? [
              { src: currentTrack.artwork, sizes: '96x96', type: 'image/jpeg' },
              { src: currentTrack.artwork, sizes: '128x128', type: 'image/jpeg' },
              { src: currentTrack.artwork, sizes: '192x192', type: 'image/jpeg' },
              { src: currentTrack.artwork, sizes: '512x512', type: 'image/jpeg' }
            ]
          : [
              { src: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512', sizes: '512x512', type: 'image/jpeg' }
            ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        setIsPlaying(true);
        if (audioRef.current) audioRef.current.play().catch(() => {});
        requestWakeLock();
        initWebAudioKeepAlive();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.pause();
        releaseWakeLock();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        handlePrev();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handleNext();
      });

      try {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            handleSeek(details.seekTime);
          }
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          handleSeek(Math.max(0, currentTime - 10));
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
          handleSeek(Math.min(duration, currentTime + 10));
        });
      } catch {}
    }
  }, [currentTrack, playlist, handleNext, handlePrev, currentTime, duration, requestWakeLock, releaseWakeLock, initWebAudioKeepAlive]);

  // Atualização contínua do estado de posição na Media Session (Permite scrub na tela de bloqueio do celular)
  useEffect(() => {
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0 && hasAudioStarted) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, duration),
          playbackRate: isPlaying ? 1 : 0,
          position: Math.min(currentTime, duration)
        });
      } catch {}
    }
  }, [currentTime, duration, isPlaying, hasAudioStarted]);

  // Configuração da Fonte de Áudio Real
  useEffect(() => {
    setCurrentTime(0);
    setIsAudioBuffering(true);
    setHasAudioStarted(false);
    setIsPlaying(true);

    if (currentTrack.durationSeconds) {
      setDuration(currentTrack.durationSeconds);
    }

    const streamUrl = getStreamUrl(currentTrack);
    setAudioSource(streamUrl);

    // Se tiver youtubeId, salva para sincronizar com clipe opcional
    if (currentTrack.youtubeId) {
      setResolvedVideoId(currentTrack.youtubeId);
    } else {
      // Busca vídeo correspondente em background caso o usuário queira abrir o clipe
      fetch(`/api/youtube/search?q=${encodeURIComponent(`${currentTrack.artist} ${currentTrack.title}`)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.results && data.results.length > 0) {
            setResolvedVideoId(data.results[0].id);
          }
        })
        .catch(() => {});
    }

    return () => {
      releaseWakeLock();
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist, currentTrack.youtubeId, releaseWakeLock]);

  // Manuseio de Drag da Janela Suspensa In-App
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: clientX - floatingPos.x,
      y: clientY - floatingPos.y
    });
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setFloatingPos({
        x: Math.max(10, Math.min(window.innerWidth - 300, clientX - dragOffset.x)),
        y: Math.max(10, Math.min(window.innerHeight - 200, clientY - dragOffset.y))
      });
    };

    const handleEnd = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset]);

  return (
    <>
      {/* ELEMENTO DE ÁUDIO NATIVO PRINCIPAL (REPRODUÇÃO CONTÍNUA EM SEGUNDO PLANO E TELA BLOQUEADA) */}
      {audioSource ? (
        <audio
          ref={audioRef}
          src={audioSource}
          autoPlay
          playsInline
          onPlaying={() => {
            setIsAudioBuffering(false);
            setHasAudioStarted(true);
            setIsPlaying(true);
            requestWakeLock();
            initWebAudioKeepAlive();
          }}
          onTimeUpdate={(e) => {
            const ct = e.currentTarget.currentTime;
            // O tempo do player é 100% fiel e exato ao som real emitido pelos alto-falantes
            setCurrentTime(Math.floor(ct));
            if (ct > 0 && !hasAudioStarted) {
              setHasAudioStarted(true);
              setIsAudioBuffering(false);
            }
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (d && !isNaN(d) && d > 0) {
              setDuration(Math.floor(d));
            }
          }}
          onWaiting={() => setIsAudioBuffering(true)}
          onEnded={() => {
            if (isLooping) {
              handleSeek(0);
            } else {
              handleNext();
            }
          }}
          onError={() => {
            console.warn('Erro no stream de áudio, tentando fallback de preview...');
            if (currentTrack.previewUrl && audioSource !== currentTrack.previewUrl) {
              setAudioSource(currentTrack.previewUrl);
            } else {
              setIsAudioBuffering(false);
            }
          }}
        />
      ) : null}

      {/* MODAL DE DOWNLOAD DIRETO DE MP3 COMPLETO (SEM 30s) */}
      {showDownloadModal && (
        <DownloadFullTrackModal
          track={{
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            artwork: currentTrack.artwork,
            durationSeconds: duration,
            youtubeId: resolvedVideoId || undefined,
            previewUrl: currentTrack.previewUrl
          }}
          onClose={() => setShowDownloadModal(false)}
          onAddToLocalRepair={onAddToLocalRepair}
        />
      )}

      {/* JANELA SUSPENSA FLUTUANTE (PIP IN-APP SOB DEMANDA PARA ASSISTIR AO CLIPE) */}
      {showVideoDrawer && resolvedVideoId && (
        <div
          style={isFloatingMiniPlayer ? { left: `${floatingPos.x}px`, top: `${floatingPos.y}px` } : undefined}
          className={`${
            isFloatingMiniPlayer
              ? 'fixed z-50 w-72 sm:w-80 shadow-2xl rounded-2xl border-2 border-emerald-500 bg-slate-950 overflow-hidden select-none'
              : 'fixed bottom-24 right-4 sm:right-8 z-50 w-72 sm:w-96 rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/50 bg-slate-950 animate-in slide-in-from-bottom-5 duration-200'
          }`}
        >
          {/* Top Drag Bar do PiP */}
          <div
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="p-2.5 bg-slate-900 flex items-center justify-between border-b border-slate-800 cursor-move"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Tv className="w-3.5 h-3.5" />
              <span>Vídeo Oficial (PiP)</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Alternar Mini-Player Flutuante Móvel */}
              <button
                onClick={() => setIsFloatingMiniPlayer(!isFloatingMiniPlayer)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title={isFloatingMiniPlayer ? 'Fixar no canto' : 'Mover janela suspensa livremente'}
              >
                {isFloatingMiniPlayer ? <Minimize2 className="w-3.5 h-3.5" /> : <Move className="w-3.5 h-3.5" />}
              </button>

              {/* Fechar Vídeo (Música continua tocando no áudio normalmente!) */}
              <button
                onClick={() => setShowVideoDrawer(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Fechar vídeo (o áudio continuará tocando normalmente)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Player do Vídeo Mudo Sincronizado para não duplicar som */}
          <div className="aspect-video w-full bg-black flex items-center justify-center">
            {resolvedVideoId ? (
              <iframe
                ref={iframeRef}
                src={`https://www.youtube.com/embed/${resolvedVideoId}?autoplay=1&mute=1&start=${currentTime}&enablejsapi=1&origin=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.origin : ''
                )}`}
                title={currentTrack.title}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full border-0 pointer-events-auto"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-950">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs">Sincronizando vídeo oficial...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BARRA FIXA DO PLAYER DOCKADA NO RODAPÉ (MODO ÁUDIO PADRÃO) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 shadow-2xl text-slate-100 transition-all duration-200">
        
        {/* Barra de Progresso Scrubbable no Topo da Dock */}
        <div className="relative group w-full h-2 cursor-pointer bg-slate-900 overflow-hidden">
          {(!hasAudioStarted || isAudioBuffering) && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent animate-[shimmer_1.5s_infinite] pointer-events-none" />
          )}
          <div
            className={`h-full relative transition-all duration-200 ${
              !hasAudioStarted || isAudioBuffering
                ? 'bg-slate-700/40'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400'
            }`}
            style={{
              width: `${
                !hasAudioStarted || isAudioBuffering
                  ? 0
                  : Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100))
              }%`
            }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 180}
            value={hasAudioStarted ? currentTime : 0}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
          
          {/* Lado Esquerdo: Capa, Título, Artista e Badge */}
          <div className="flex items-center gap-3 min-w-0 max-w-xs sm:max-w-sm">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 shadow-md relative group">
              {currentTrack.artwork && currentTrack.artwork.trim() !== '' ? (
                <img
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
                  <Music className="w-6 h-6" />
                </div>
              )}
              {isAudioBuffering && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-white truncate block">
                  {currentTrack.title}
                </span>
                <span className="hidden xs:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>Áudio 100%</span>
                </span>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-400 truncate block">
                {currentTrack.artist} {currentTrack.album ? `• ${currentTrack.album}` : ''}
              </span>
            </div>

            {/* Botão de Favoritar */}
            <button
              onClick={() => toggleFavorite(currentTrack as any)}
              className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                isFav ? 'text-rose-400' : 'text-slate-400 hover:text-white'
              }`}
              title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-400' : ''}`} />
            </button>
          </div>

          {/* Centro: Controles Principais (Prev, Play/Pause, Next, Tempos) */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Repetir (Visível no Mobile e Desktop) */}
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLooping ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
                title="Repetir música"
              >
                <Repeat className="w-4 h-4" />
              </button>

              {/* Faixa Anterior */}
              <button
                onClick={handlePrev}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Faixa anterior"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Botão Play / Pause */}
              <button
                onClick={togglePlay}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
              >
                {isAudioBuffering ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                ) : (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Próxima Faixa */}
              <button
                onClick={handleNext}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Próxima faixa"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Ativar Clipe Oficial / PiP (Sob Demanda) */}
              <button
                onClick={() => setShowVideoDrawer(!showVideoDrawer)}
                className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                  showVideoDrawer
                    ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Assistir ao Clipe Oficial em Janela Suspensa / PiP"
              >
                <Tv className="w-4 h-4" />
                <span className="hidden md:inline">Clipe</span>
              </button>
            </div>

            {/* Display de Tempo Sincronizado */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono select-none">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              {!hasAudioStarted && isAudioBuffering && (
                <span className="text-emerald-400 font-sans hidden sm:inline">• Conectando áudio...</span>
              )}
            </div>
          </div>

          {/* Lado Direito: Ações Extras (Fila, Download MP3, Volume, Fechar) */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Abrir Fila de Reprodução */}
            <button
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              className={`p-1.5 rounded-lg transition cursor-pointer relative ${
                isQueueOpen ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white'
              }`}
              title="Abrir fila de reprodução do celular"
            >
              <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" />
              {queue && queue.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] flex items-center justify-center">
                  {queue.length}
                </span>
              )}
            </button>

            {/* Adicionar a uma Playlist */}
            <button
              onClick={() => openAddToPlaylistModal(currentTrack as any)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer hidden md:block"
              title="Adicionar a uma playlist"
            >
              <ListPlus className="w-4 h-4" />
            </button>

            {/* Botão Baixar Música Completa MP3 */}
            <button
              onClick={() => setShowDownloadModal(true)}
              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Baixar MP3 100% completo no dispositivo"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar MP3</span>
            </button>

            {/* Volume Desktop */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  setIsMuted(false);
                }}
                className="w-16 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Fechar Player se onClose foi provido */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Minimizar reprodutor"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
