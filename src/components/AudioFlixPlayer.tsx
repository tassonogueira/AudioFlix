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
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [showVideoDrawer, setShowVideoDrawer] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isNativePipActive, setIsNativePipActive] = useState(false);
  const [isFloatingMiniPlayer, setIsFloatingMiniPlayer] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const {
    isFavorite,
    toggleFavorite,
    openAddToPlaylistModal,
    queue,
    isQueueOpen,
    setIsQueueOpen,
    removeFromQueue,
    showToast
  } = usePlaylistContext();

  const isFav = isFavorite(currentTrack.id);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);

  // Formatar segundos em mm:ss
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Pular para o próximo na lista de reprodução ou fila
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

    // 2. Fallback para playlist atual
    if (!playlist || playlist.length === 0 || !onTrackChange) return;
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      onTrackChange(playlist[currentIndex + 1]);
    } else if (playlist.length > 0) {
      onTrackChange(playlist[0]);
    }
  }, [queue, playlist, onTrackChange, currentTrack.id, removeFromQueue]);

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

  // Mudar posição do cursor de reprodução
  const handleSeek = (newSeconds: number) => {
    setCurrentTime(newSeconds);
    if (iframeRef.current?.contentWindow) {
      const command = JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [newSeconds, true]
      });
      iframeRef.current.contentWindow.postMessage(command, '*');
    }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, duration),
          playbackRate: 1,
          position: Math.min(newSeconds, duration)
        });
      } catch {}
    }
  };

  // Controles de Play / Pause
  const togglePlay = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);

    if (iframeRef.current?.contentWindow) {
      const command = nextState
        ? JSON.stringify({ event: 'command', func: 'playVideo', args: [] })
        : JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });
      iframeRef.current.contentWindow.postMessage(command, '*');
    }

    if (keepAliveAudioRef.current) {
      if (nextState) {
        keepAliveAudioRef.current.play().catch(() => {});
      } else {
        keepAliveAudioRef.current.pause();
      }
    }
  };

  // Picture-in-Picture Nativo do Sistema Operacional (Android, iOS Safari, Mac, Windows)
  const handleNativePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsNativePipActive(false);
        showToast('Picture-in-Picture fechado.');
      } else if (videoRef.current && (document.pictureInPictureEnabled || 'webkitSetPresentationMode' in videoRef.current)) {
        if ('requestPictureInPicture' in videoRef.current) {
          await videoRef.current.requestPictureInPicture();
          setIsNativePipActive(true);
          showToast('Modo Picture-in-Picture nativo ativado!');
        } else if ('webkitSetPresentationMode' in videoRef.current) {
          // iOS Safari PiP
          // @ts-ignore
          videoRef.current.webkitSetPresentationMode('picture-in-picture');
          setIsNativePipActive(true);
          showToast('Modo Picture-in-Picture ativado!');
        }
      } else {
        setIsFloatingMiniPlayer(true);
        setShowVideoDrawer(true);
        showToast('Janela suspensa flutuante ativada na tela!');
      }
    } catch (err: any) {
      console.warn('Erro ao solicitar Picture-in-Picture nativo:', err);
      setIsFloatingMiniPlayer(true);
      setShowVideoDrawer(true);
      showToast('Janela flutuante ativada!');
    }
  };

  // Configuração contínua do Canvas Visualizer para o Vídeo PiP Nativo
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentTrack.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=640&q=80';

    const renderFrame = () => {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (img.complete && img.naturalWidth > 0) {
        try {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } catch {}
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(currentTrack.title.substring(0, 32), 24, canvas.height - 60);

      ctx.fillStyle = '#34d399';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText(currentTrack.artist.substring(0, 36) + ' • AudioFlix', 24, canvas.height - 30);

      const progressWidth = (canvas.width - 48) * (currentTime / (duration || 1));
      ctx.fillStyle = '#10b981';
      ctx.fillRect(24, canvas.height - 18, Math.max(4, progressWidth), 4);

      animId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    try {
      // @ts-ignore
      if (!video.srcObject && canvas.captureStream) {
        // @ts-ignore
        const stream = canvas.captureStream(25);
        video.srcObject = stream;
        video.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Canvas stream PiP error:', e);
    }

    return () => cancelAnimationFrame(animId);
  }, [currentTrack, currentTime, duration]);

  // Suporte Avançado à Media Session API (Reprodução em Segundo Plano e Tela Bloqueada)
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
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        }
        if (keepAliveAudioRef.current) keepAliveAudioRef.current.play().catch(() => {});
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        setIsPlaying(false);
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
          );
        }
        if (keepAliveAudioRef.current) keepAliveAudioRef.current.pause();
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
  }, [currentTrack, playlist, handleNext, handlePrev, currentTime, duration]);

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

  // Listener para mensagens do YouTube Iframe API (detecta início real do áudio)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (!data) return;

        // Player state: 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING, 0 = ENDED
        if (data.event === 'infoDelivery' && data.info) {
          if (data.info.playerState === 1) {
            // ÁUDIO REALMENTE COMEÇOU A TOCAR!
            setIsAudioBuffering(false);
            setHasAudioStarted(true);
            setIsPlaying(true);
          } else if (data.info.playerState === 3) {
            setIsAudioBuffering(true);
          } else if (data.info.playerState === 0) {
            // Faixa terminou
            if (isLooping) {
              handleSeek(0);
            } else {
              handleNext();
            }
          }

          // Tempo real enviado pelo player interno do YouTube
          if (typeof data.info.currentTime === 'number') {
            const currentAudioSec = Math.floor(data.info.currentTime);
            if (currentAudioSec > 0) {
              setHasAudioStarted(true);
              setIsAudioBuffering(false);
            }
            // Sincroniza estritamente com o tempo real emitido pelo áudio
            setCurrentTime(currentAudioSec);
          }

          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(Math.floor(data.info.duration));
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isLooping, handleNext]);

  // Quando a faixa muda, resolve o YouTube Video ID completo se não existir
  useEffect(() => {
    let isMounted = true;
    setCurrentTime(0);
    setIsAudioBuffering(true);
    setHasAudioStarted(false);
    setIsPlaying(true);

    if (currentTrack.youtubeId) {
      setResolvedVideoId(currentTrack.youtubeId);
      if (currentTrack.durationSeconds) setDuration(currentTrack.durationSeconds);
      setIsLoadingStream(false);
      return;
    }

    setIsLoadingStream(true);
    const query = `${currentTrack.artist} ${currentTrack.title}`;

    fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => {
        if (isMounted && data.results && data.results.length > 0) {
          const matched = data.results[0];
          setResolvedVideoId(matched.id);
          if (matched.seconds) {
            setDuration(matched.seconds);
          }
        }
      })
      .catch((err) => {
        console.warn('Erro ao resolver stream do YouTube:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingStream(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentTrack.id, currentTrack.youtubeId, currentTrack.title, currentTrack.artist]);

  // Timer de Avanço Contínuo Sincronizado (Só avança se o áudio REALMENTE começou a soar!)
  useEffect(() => {
    // CRÍTICO: Não avança tempo se estiver carregando, conectando ou se o áudio ainda não iniciou!
    if (!isPlaying || isAudioBuffering || !hasAudioStarted || isLoadingStream) return;

    // 1. Pede o tempo real ao player a cada segundo via postMessage
    const pingInterval = setInterval(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }),
          '*'
        );
      }
    }, 1000);

    // 2. Incremento suave local que é mantido em sincronia
    const advanceInterval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          if (isLooping) return 0;
          handleNext();
          return duration;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      clearInterval(pingInterval);
      clearInterval(advanceInterval);
    };
  }, [isPlaying, isAudioBuffering, hasAudioStarted, isLoadingStream, duration, isLooping, handleNext]);

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
      {/* Elemento de Áudio Keep-Alive para background playback em tela bloqueada */}
      <audio
        ref={keepAliveAudioRef}
        loop
        playsInline
        src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
      />

      {/* Canvas e Vídeo Ocultos para Alimentar o Picture-in-Picture Nativo */}
      <div className="hidden pointer-events-none opacity-0 w-0 h-0 overflow-hidden">
        <canvas ref={canvasRef} width={640} height={360} />
        <video ref={videoRef} playsInline autoPlay muted />
      </div>

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
              <span>Clipe Oficial (Vídeo & PiP)</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Botão PiP Nativo do SO */}
              <button
                onClick={handleNativePiP}
                className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Ativar Picture-in-Picture nativo (fora do app)"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>

              {/* Alternar Mini-Player Flutuante Movel */}
              <button
                onClick={() => setIsFloatingMiniPlayer(!isFloatingMiniPlayer)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title={isFloatingMiniPlayer ? 'Fixar no canto' : 'Mover janela suspensa livremente'}
              >
                {isFloatingMiniPlayer ? <Minimize2 className="w-3.5 h-3.5" /> : <Move className="w-3.5 h-3.5" />}
              </button>

              {/* Fechar Vídeo (Música continua tocando no áudio!) */}
              <button
                onClick={() => setShowVideoDrawer(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Fechar vídeo (o áudio continuará tocando normalmente)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Player do Vídeo */}
          <div className="aspect-video w-full bg-black">
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${resolvedVideoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(
                typeof window !== 'undefined' ? window.location.origin : ''
              )}`}
              title={currentTrack.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>
        </div>
      )}

      {/* IFRAME OCULTO DE ÁUDIO QUANDO O VÍDEO ESTÁ FECHADO (ÁUDIO PADRÃO CONTÍNUO) */}
      {!showVideoDrawer && resolvedVideoId && (
        <div className="hidden pointer-events-none w-0 h-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${resolvedVideoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(
              typeof window !== 'undefined' ? window.location.origin : ''
            )}`}
            title="AudioFlix Audio Engine"
            allow="autoplay; encrypted-media; picture-in-picture"
            className="w-1 h-1"
          />
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
            className={`h-full relative transition-all duration-300 ${
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
              {currentTrack.artwork ? (
                <img
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Music className="w-6 h-6" />
                </div>
              )}

              {/* Equalizer Wave animado somente quando o áudio realmente começou */}
              {isPlaying && hasAudioStarted && !isAudioBuffering && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-0.5">
                  <span className="w-0.5 bg-emerald-400 rounded-full h-2 animate-[pulse_0.6s_infinite]" />
                  <span className="w-0.5 bg-emerald-400 rounded-full h-4 animate-[pulse_0.8s_infinite]" />
                  <span className="w-0.5 bg-emerald-400 rounded-full h-3 animate-[pulse_0.5s_infinite]" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-white truncate block">
                  {currentTrack.title}
                </span>
                <span className="hidden md:inline-flex px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase tracking-wider shrink-0">
                  Áudio Completo
                </span>
              </div>
              <span className="text-[11px] text-slate-400 truncate block">
                {currentTrack.artist} {currentTrack.album ? `• ${currentTrack.album}` : ''}
              </span>
            </div>

            {/* Ações de Favoritar e Adicionar à Playlist */}
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleFavorite(currentTrack)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isFav
                    ? 'text-rose-500 hover:text-rose-400 bg-rose-500/10'
                    : 'text-slate-400 hover:text-rose-400 hover:bg-slate-900'
                }`}
                title={isFav ? 'Remover das favoritas' : 'Adicionar às favoritas'}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={() => openAddToPlaylistModal(currentTrack)}
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-lg transition cursor-pointer"
                title="Adicionar à Playlist"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Centro: Controles de Reprodução e Timer Total Sincronizado */}
          <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-1.5 rounded-lg transition cursor-pointer hidden sm:inline-block ${
                  isLooping ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={isLooping ? 'Repetir ativado' : 'Repetir desativado'}
              >
                <Repeat className="w-4 h-4" />
              </button>

              <button
                onClick={handlePrev}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
                title="Faixa anterior"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoadingStream}
                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-emerald-950/40 active:scale-95 cursor-pointer disabled:opacity-50"
                title={isPlaying ? 'Pausar' : 'Tocar música'}
              >
                {isLoadingStream ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={handleNext}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
                title="Próxima faixa"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Botão Assistir Clipe / Ativar Vídeo Sob Demanda */}
              <button
                onClick={() => setShowVideoDrawer(!showVideoDrawer)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  showVideoDrawer
                    ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900 bg-slate-900/60 border border-slate-800'
                }`}
                title={showVideoDrawer ? 'Ocultar vídeo (áudio continua)' : 'Assistir ao clipe oficial da música'}
              >
                <Tv className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">
                  {showVideoDrawer ? 'Fechar Clipe' : 'Assistir Clipe'}
                </span>
              </button>

              {/* Botão Picture-in-Picture Nativo */}
              <button
                onClick={handleNativePiP}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isNativePipActive ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
                title="Modo Picture-in-Picture nativo (janela flutuante no celular/PC)"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Botão Fila de Reprodução com Contador de Itens */}
              <button
                onClick={() => setIsQueueOpen(!isQueueOpen)}
                className={`p-1.5 rounded-lg transition cursor-pointer relative ${
                  isQueueOpen ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
                title="Fila de reprodução"
              >
                <ListMusic className="w-4 h-4" />
                {queue.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-slate-950 font-bold text-[9px] rounded-full flex items-center justify-center">
                    {queue.length > 9 ? '9+' : queue.length}
                  </span>
                )}
              </button>
            </div>

            {/* Duração Real Atual / Total (Sincronizada estritamente com o áudio!) */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              {!hasAudioStarted || isAudioBuffering ? (
                <span className="flex items-center gap-1.5 text-amber-400 animate-pulse text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Conectando áudio...</span>
                </span>
              ) : (
                <span className="text-emerald-400 font-semibold">{formatTime(currentTime)}</span>
              )}
              <span>/</span>
              <span>{formatTime(duration)}</span>
              <span className="hidden sm:inline text-slate-600 font-sans">•</span>
              <span className="hidden sm:inline text-emerald-400/80 font-sans text-[10px]">
                Áudio em Segundo Plano
              </span>
            </div>
          </div>

          {/* Lado Direito: Download MP3 Completo, Volume e Fechar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Botão Destaque: Baixar MP3 Completo */}
            <button
              onClick={() => setShowDownloadModal(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              title="Baixar MP3 100% completo sem 30s direto no dispositivo"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar MP3</span>
            </button>

            {/* Volume */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-300" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Fechar player */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
                title="Fechar player"
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
