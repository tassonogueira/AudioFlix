import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Repeat,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Download,
  X,
  Music,
  CheckCircle2,
  Sparkles,
  Loader2,
  Heart,
  ListPlus,
  ListMusic,
  Layers,
  ShieldCheck,
  Disc3,
  Info,
  Mic2
} from 'lucide-react';
import DownloadFullTrackModal, { DownloadTrackInfo } from './DownloadFullTrackModal.tsx';
import TrackArtistInfoModal from './TrackArtistInfoModal.tsx';
import KaraokeLyricsModal from './KaraokeLyricsModal.tsx';
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
  isDeviceAudio?: boolean;
}

interface AudioFlixPlayerProps {
  currentTrack: PlayerTrack | null;
  playlist?: PlayerTrack[];
  onTrackChange?: (track: PlayerTrack) => void;
  onClose?: () => void;
  onAddToLocalRepair?: (file: { name: string; blob?: Blob }) => void;
  onSearchArtist?: (artistName: string) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  registerTogglePlay?: (toggleFn: () => void) => void;
}

export default function AudioFlixPlayer({
  currentTrack,
  playlist = [],
  onTrackChange,
  onClose,
  onAddToLocalRepair,
  onSearchArtist,
  onPlayStateChange,
  registerTogglePlay
}: AudioFlixPlayerProps) {
  if (!currentTrack) return null;

  const [isPlaying, setIsPlaying] = useState(true);
  const [isAudioBuffering, setIsAudioBuffering] = useState(true);
  const [hasAudioStarted, setHasAudioStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(currentTrack.durationSeconds || 180);
  const [resolvedVideoId, setResolvedVideoId] = useState<string | null>(currentTrack.youtubeId || null);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('audioflix_volume');
      if (saved !== null) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
      }
    } catch {}
    return 85;
  });

  useEffect(() => {
    try {
      localStorage.setItem('audioflix_volume', String(volume));
    } catch {}
  }, [volume]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showTrackInfoModal, setShowTrackInfoModal] = useState(false);

  // 3 Níveis de Controle Integrados:
  // 'footer' = Estado C: Player de Rodapé (Modo Multitarefa)
  // 'expanded' = Estado B: Player Expandido (Modo Tela Cheia)
  // 'floating_fab' = Estado A: Botão Flutuante (Modo Discreto)
  const [playerMode, setPlayerMode] = useState<'footer' | 'expanded' | 'floating_fab'>('footer');

  const getStreamUrl = (track: PlayerTrack) => {
    // 1. Áudio local do dispositivo / pendrive (armazenado em memória com blob: ou data:)
    const isDevice = !!(
      track.isDeviceAudio ||
      String(track.id || '').startsWith('device_') ||
      track.artist === 'Dispositivo / Pendrive' ||
      (track.previewUrl && (track.previewUrl.startsWith('blob:') || track.previewUrl.startsWith('data:')))
    );

    if (isDevice) {
      return track.previewUrl || '';
    }

    // 2. Músicas do YouTube / catálogo oficial: streaming de áudio completo em alta fidelidade (sem cortes de 30s)
    const ytId = track.youtubeId || (typeof track.id === 'string' && track.id.length === 11 ? track.id : '');
    return `/api/music/stream-audio?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&youtubeId=${encodeURIComponent(ytId)}`;
  };

  // Faixa ativa exibida e motor duplo de áudio para transição suave sem interrupção (Crossfade A/B Deck)
  const [displayedTrack, setDisplayedTrack] = useState<PlayerTrack>(currentTrack);
  const [outgoingTrackTitle, setOutgoingTrackTitle] = useState<string>('');
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const isTransitioningRef = useRef<boolean>(false);
  const crossfadeTimerRef = useRef<any>(null);
  const transitionTimeoutRef = useRef<any>(null);
  const [showKaraokeModal, setShowKaraokeModal] = useState<boolean>(false);

  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');

  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>(() => (currentTrack ? getStreamUrl(currentTrack) : ''));
  const bufferTimeoutRef = useRef<any>(null);
  const consecutiveErrorsRef = useRef(0);

  const getActiveAudio = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);

  const getInactiveAudio = useCallback(() => {
    return activeDeckRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);

  const activeTrack = displayedTrack || currentTrack;

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

  const isFav = isFavorite(activeTrack.id);
  const isDeviceTrack = !!(
    activeTrack?.isDeviceAudio ||
    String(activeTrack?.id || '').startsWith('device_') ||
    activeTrack?.artist === 'Dispositivo / Pendrive'
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastPlaylistIndexRef = useRef<number>(-1);
  const transitionToTrackRef = useRef<(t: PlayerTrack) => void>(() => {});

  // Rastreia o índice atual caso a música tocando pertença à playlist principal
  useEffect(() => {
    if (!currentTrack || !playlist || playlist.length === 0) return;
    const idx = playlist.findIndex((t) => String(t.id) === String(currentTrack.id));
    if (idx !== -1) {
      lastPlaylistIndexRef.current = idx;
    }
  }, [currentTrack, playlist]);

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

  // Calcula com antecedência a próxima faixa da fila, playlist ou favoritas verificando disponibilidade
  const peekNextTrack = useCallback((): PlayerTrack | null => {
    // Helper para verificar se faixa local de dispositivo possui previewUrl ativa neste aparelho
    const isTrackPlayable = (t: PlayerTrack | null | undefined): boolean => {
      if (!t) return false;
      const isDevice = Boolean(
        t.isDeviceAudio ||
        String(t.id || '').startsWith('device_') ||
        t.artist === 'Dispositivo / Pendrive'
      );
      if (isDevice) {
        return Boolean(t.previewUrl && (t.previewUrl.startsWith('blob:') || t.previewUrl.startsWith('data:')));
      }
      return true; // Músicas do YouTube / Catálogo / Nuvem sempre acessíveis via streaming
    };

    // 1. Prioriza a Fila Temporária se houver itens disponíveis
    if (queue && queue.length > 0) {
      for (const qTrack of queue) {
        if (isTrackPlayable(qTrack)) {
          return qTrack;
        }
      }
    }

    const cur = displayedTrack || currentTrack;
    const isCurDevice = !!(
      cur?.isDeviceAudio ||
      String(cur?.id || '').startsWith('device_') ||
      cur?.artist === 'Dispositivo / Pendrive'
    );

    if (isCurDevice) {
      if (!playlist || playlist.length === 0) return null;
      const currentIndex = playlist.findIndex((t) => String(t.id) === String(cur.id));
      for (let i = currentIndex + 1; i < playlist.length; i++) {
        if (isTrackPlayable(playlist[i])) return playlist[i];
      }
      if (isLooping) {
        for (let i = 0; i <= currentIndex; i++) {
          if (isTrackPlayable(playlist[i])) return playlist[i];
        }
      }
      return null;
    }

    // 2. Próxima faixa da playlist principal
    if (playlist && playlist.length > 0) {
      const currentIndex = playlist.findIndex((t) => String(t.id) === String(cur.id));
      const startIdx = currentIndex >= 0 ? currentIndex + 1 : (lastPlaylistIndexRef.current >= 0 ? lastPlaylistIndexRef.current + 1 : 0);
      
      for (let i = startIdx; i < playlist.length; i++) {
        if (isTrackPlayable(playlist[i])) return playlist[i];
      }
      if (isLooping || playlist.length > 1) {
        for (let i = 0; i < startIdx; i++) {
          if (isTrackPlayable(playlist[i])) return playlist[i];
        }
      }
    }

    // 3. Fallback para favoritas
    if (favorites && favorites.length > 0) {
      const favIndex = favorites.findIndex((f) => String(f.id) === String(cur.id));
      const startIdx = favIndex >= 0 ? favIndex + 1 : 0;
      for (let i = startIdx; i < favorites.length; i++) {
        if (isTrackPlayable(favorites[i])) return favorites[i];
      }
      for (let i = 0; i < startIdx; i++) {
        if (isTrackPlayable(favorites[i])) return favorites[i];
      }
    }

    return null;
  }, [queue, displayedTrack, currentTrack, playlist, isLooping, favorites]);

  // Prepara e pré-aquece no backend a próxima música e as próximas da playlist/fila
  const prepareNextTrack = useCallback(() => {
    const next = peekNextTrack();
    if (!next) return;
    const cur = displayedTrack || currentTrack;
    if (String(next.id) === String(cur?.id)) return;

    const nextStreamUrl = getStreamUrl(next);
    if (!nextStreamUrl) return;

    // Aquece o cache do backend com request HEAD
    if (nextStreamUrl.startsWith('/api/music/stream-audio')) {
      fetch(nextStreamUrl, { method: 'HEAD' }).catch(() => {});
    }

    // Coleta a próxima música e mais faixas da playlist/fila para pré-aquecer em paralelo
    const upcomingToPrefetch: any[] = [next];
    if (queue && queue.length > 0) {
      for (const q of queue) {
        if (String(q.id) !== String(next.id) && !q.isDeviceAudio) {
          upcomingToPrefetch.push(q);
          break;
        }
      }
    }
    if (playlist && playlist.length > 0) {
      const curIdx = playlist.findIndex((t) => String(t.id) === String(cur?.id));
      if (curIdx >= 0) {
        for (let i = curIdx + 1; i < Math.min(playlist.length, curIdx + 3); i++) {
          if (!playlist[i].isDeviceAudio && String(playlist[i].id) !== String(next.id)) {
            upcomingToPrefetch.push(playlist[i]);
          }
        }
      }
    }

    fetch('/api/music/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: upcomingToPrefetch })
    }).catch(() => {});
  }, [peekNextTrack, displayedTrack, currentTrack, queue, playlist]);

  // Pré-aquecimento automático em segundo plano assim que a fila ou playlist é atualizada
  useEffect(() => {
    const upcoming: any[] = [];
    if (queue && queue.length > 0) {
      for (const t of queue.slice(0, 2)) {
        if (!t.isDeviceAudio) upcoming.push(t);
      }
    }
    if (playlist && playlist.length > 0 && displayedTrack) {
      const curIdx = playlist.findIndex((t) => String(t.id) === String(displayedTrack.id));
      if (curIdx >= 0) {
        for (let i = curIdx + 1; i < Math.min(playlist.length, curIdx + 3); i++) {
          if (!playlist[i].isDeviceAudio) upcoming.push(playlist[i]);
        }
      }
    }
    if (upcoming.length === 0) return;

    fetch('/api/music/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: upcoming })
    }).catch(() => {});
  }, [queue, playlist, displayedTrack]);

  // Pular para o próximo na lista de reprodução, fila ou favoritas
  const handleNext = useCallback(() => {
    const next = peekNextTrack();
    if (!next) return;

    if (queue && queue.length > 0 && String(queue[0].id) === String(next.id)) {
      removeFromQueue(0);
    }

    if (onTrackChange) {
      onTrackChange(next);
    } else {
      transitionToTrackRef.current(next);
    }
  }, [peekNextTrack, queue, removeFromQueue, onTrackChange]);

  // Mudar posição do cursor de reprodução (Scrubbing milimétrico)
  const handleSeek = useCallback((newSeconds: number) => {
    setCurrentTime(newSeconds);
    const activeAudio = getActiveAudio();
    if (activeAudio) {
      activeAudio.currentTime = newSeconds;
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
  }, [getActiveAudio, duration, isPlaying]);

  // Finalização de faixa com suporte a repetição
  const handleEnded = useCallback(() => {
    if (isLooping) {
      handleSeek(0);
      const activeAudio = getActiveAudio();
      activeAudio?.play().catch(() => {});
    } else {
      handleNext();
    }
  }, [isLooping, handleSeek, handleNext, getActiveAudio]);

  // Voltar para o anterior na lista de reprodução
  const handlePrev = useCallback(() => {
    if (currentTime > 4) {
      handleSeek(0);
      return;
    }
    if (!playlist || playlist.length === 0 || !onTrackChange) return;

    let prevIndex = -1;
    const currentIndex = playlist.findIndex((t) => String(t.id) === String(currentTrack.id));
    if (currentIndex > 0) {
      prevIndex = currentIndex - 1;
    } else if (lastPlaylistIndexRef.current > 0) {
      prevIndex = lastPlaylistIndexRef.current - 1;
    } else if (playlist.length > 0) {
      prevIndex = playlist.length - 1;
    }

    if (prevIndex >= 0 && prevIndex < playlist.length) {
      lastPlaylistIndexRef.current = prevIndex;
      onTrackChange(playlist[prevIndex]);
    }
  }, [currentTime, playlist, onTrackChange, currentTrack, handleSeek]);

  // Transição suave aperfeiçoada: Mantém a música atual tocando até a próxima conectar,
  // baixando gradualmente o volume apenas no momento da troca para NUNCA cortar o início da próxima faixa!
  const transitionToTrack = useCallback((targetTrack: PlayerTrack) => {
    if (!targetTrack) return;

    const currentDeckId = activeDeckRef.current;
    const currentDeck = currentDeckId === 'A' ? deckARef.current : deckBRef.current;
    const nextDeckId = currentDeckId === 'A' ? 'B' : 'A';
    const nextDeck = nextDeckId === 'A' ? deckARef.current : deckBRef.current;

    // Se já é a mesma faixa ativa:
    if (displayedTrack && String(displayedTrack.id) === String(targetTrack.id)) {
      if (currentDeck && currentDeck.paused) {
        currentDeck.play().catch(() => {});
        setIsPlaying(true);
        onPlayStateChange?.(true);
      }
      return;
    }

    // Análise rápida de disponibilidade para faixas locais
    const isDevice = Boolean(
      targetTrack.isDeviceAudio ||
      String(targetTrack.id || '').startsWith('device_') ||
      targetTrack.artist === 'Dispositivo / Pendrive' ||
      (targetTrack.previewUrl && (targetTrack.previewUrl.startsWith('blob:') || targetTrack.previewUrl.startsWith('data:')))
    );
    if (isDevice && (!targetTrack.previewUrl || (!targetTrack.previewUrl.startsWith('blob:') && !targetTrack.previewUrl.startsWith('data:')))) {
      showToast(`⚠️ Faixa local "${targetTrack.title}" não disponível neste aparelho. Pulando...`);
      setTimeout(() => handleNext(), 350);
      return;
    }

    const targetVolume = isMuted ? 0 : volume / 100;
    const isCurrentPlaying = Boolean(
      currentDeck &&
      !currentDeck.paused &&
      !currentDeck.ended &&
      currentDeck.currentTime > 0
    );

    // Salva o título da faixa que CONTINUA TOCANDO para informar ao usuário
    if (displayedTrack?.title) {
      setOutgoingTrackTitle(displayedTrack.title);
    }

    setDisplayedTrack(targetTrack);
    setIsAudioBuffering(true);
    setIsPlaying(true);
    onPlayStateChange?.(true);
    if (targetTrack.durationSeconds) setDuration(targetTrack.durationSeconds);

    const streamUrl = getStreamUrl(targetTrack);

    // Cancela qualquer transição anterior pendente
    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    // Interrompe imediatamente a faixa anterior para conexão e carregamento instantâneo
    if (currentDeck) {
      currentDeck.pause();
      currentDeck.removeAttribute('src');
    }

    activeDeckRef.current = nextDeckId;
    if (nextDeck) {
      nextDeck.currentTime = 0; // Garante início estritamente no 0:00 sem cortes
      nextDeck.volume = targetVolume;
      nextDeck.src = streamUrl;
      nextDeck.load();

      // Monitor de primeiro frame sonoro: garante que a reprodução inicie rigorosamente em 0:00
      const onFirstPlay = () => {
        if (nextDeck && nextDeck.currentTime > 0.08 && !hasAudioStarted) {
          nextDeck.currentTime = 0;
        }
      };
      nextDeck.addEventListener('playing', onFirstPlay, { once: true });

      nextDeck.play().then(() => {
        setIsAudioBuffering(false);
        setIsTransitioning(false);
        isTransitioningRef.current = false;
        setHasAudioStarted(true);
        consecutiveErrorsRef.current = 0;
        prepareNextTrack();
      }).catch((err) => {
        console.warn('[Player Audio] Início aguardando interação:', err);
        if (nextDeck) nextDeck.volume = targetVolume;
      });
    }

    const ytId = targetTrack.youtubeId || (typeof targetTrack.id === 'string' && targetTrack.id.length === 11 ? targetTrack.id : '');
    if (ytId) {
      setResolvedVideoId(ytId);
    }

    // Monitora cache em disco em segundo plano para o arquivo definitivo do servidor
    if (!isDevice) {
      const checkTimer = setTimeout(() => {
        fetch(`/api/music/cached-status?title=${encodeURIComponent(targetTrack.title)}&artist=${encodeURIComponent(targetTrack.artist)}&youtubeId=${encodeURIComponent(ytId)}`)
          .then(r => r.json())
          .then(status => {
            const activeAudio = getActiveAudio();
            if (status && status.cached && activeAudio) {
              const freshUrl = getStreamUrl(targetTrack);
              if (freshUrl && !freshUrl.includes('previewUrl=')) {
                console.log('[Player] Cache do servidor sincronizado com sucesso.');
              }
            }
          })
          .catch(() => {});
      }, 8000);
      return () => clearTimeout(checkTimer);
    }
  }, [displayedTrack, isMuted, volume, showToast, onPlayStateChange, handleNext, prepareNextTrack, getActiveAudio]);

  useEffect(() => {
    transitionToTrackRef.current = transitionToTrack;
  }, [transitionToTrack]);

  // Controles de Play / Pause (Funcionamento 100% imediato e sincronizado)
  const togglePlay = useCallback(() => {
    const activeDeck = getActiveAudio();
    const shouldPlay = activeDeck ? activeDeck.paused : !isPlaying;
    setIsPlaying(shouldPlay);
    onPlayStateChange?.(shouldPlay);

    if (activeDeck) {
      if (shouldPlay) {
        const targetVol = isMuted ? 0 : volume / 100;
        activeDeck.volume = targetVol;
        activeDeck.play().catch((err) => {
          console.warn('[Player] Falha ao dar play:', err);
        });
        requestWakeLock();
        initWebAudioKeepAlive();
      } else {
        activeDeck.pause();
        const inactiveDeck = getInactiveAudio();
        if (inactiveDeck) inactiveDeck.pause();
        if (crossfadeTimerRef.current) {
          clearInterval(crossfadeTimerRef.current);
          crossfadeTimerRef.current = null;
        }
        releaseWakeLock();
      }
    }
  }, [isPlaying, getActiveAudio, getInactiveAudio, isMuted, volume, onPlayStateChange, requestWakeLock, releaseWakeLock, initWebAudioKeepAlive]);

  // Registra função externa para toggle play/pause se fornecido
  useEffect(() => {
    registerTogglePlay?.(togglePlay);
  }, [registerTogglePlay, togglePlay]);

  // Atualiza volume nos elementos de áudio nativos
  useEffect(() => {
    const targetVol = isMuted ? 0 : volume / 100;
    const activeAudio = getActiveAudio();
    if (activeAudio) {
      activeAudio.volume = targetVol;
      activeAudio.muted = isMuted;
    }
    const inactiveAudio = getInactiveAudio();
    if (inactiveAudio && !isTransitioningRef.current) {
      inactiveAudio.volume = 0;
      inactiveAudio.muted = isMuted;
    }
  }, [volume, isMuted, getActiveAudio, getInactiveAudio]);

  // Suporte Avançado à Media Session API (Reprodução Contínua em Segundo Plano e Tela Bloqueada)
  useEffect(() => {
    if ('mediaSession' in navigator && activeTrack) {
      const artUrl = activeTrack.artwork || currentTrack.artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeTrack.title,
        artist: activeTrack.artist,
        album: activeTrack.album || 'AudioFlix',
        artwork: [
          { src: artUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: artUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        setIsPlaying(true);
        onPlayStateChange?.(true);
        const a = getActiveAudio();
        if (a) a.play().catch(() => {});
        requestWakeLock();
        initWebAudioKeepAlive();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        setIsPlaying(false);
        onPlayStateChange?.(false);
        const a = getActiveAudio();
        if (a) a.pause();
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
  }, [currentTrack, playlist, handleNext, handlePrev, handleSeek, currentTime, duration, requestWakeLock, releaseWakeLock, initWebAudioKeepAlive, onPlayStateChange, getActiveAudio, activeTrack]);

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

  // Sincronização e inicialização de mudança de música recebida via props
  useEffect(() => {
    if (!currentTrack) return;

    if (!deckARef.current?.src && !deckBRef.current?.src) {
      transitionToTrack(currentTrack);
      return;
    }

    if (displayedTrack && String(displayedTrack.id) === String(currentTrack.id)) {
      return;
    }

    transitionToTrack(currentTrack);
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, transitionToTrack]);

  const handleEngineError = () => {
    setIsAudioBuffering(false);
    console.warn('Erro ao reproduzir faixa no reprodutor nativo:', displayedTrack?.title);
    consecutiveErrorsRef.current += 1;
    if (consecutiveErrorsRef.current > 5) {
      showToast('⚠️ Músicas indisponíveis neste aparelho. Reprodução pausada.');
      setIsPlaying(false);
      onPlayStateChange?.(false);
      consecutiveErrorsRef.current = 0;
      return;
    }

    showToast(`⚠️ Faixa indisponível ("${displayedTrack?.title || 'Música'}"). Pulando para a próxima...`);
    setTimeout(() => {
      handleNext();
    }, 400);
  };

  return (
    <>
      {/* DECK A: MOTOR NATIVO A (CROSSFADE CONTÍNUO SEM CORTE DE SOM) */}
      <audio
        ref={deckARef}
        preload="auto"
        playsInline
        onCanPlay={() => {
          if (activeDeckRef.current === 'A') {
            setIsAudioBuffering(false);
            if (isPlaying) {
              deckARef.current?.play().catch(() => {});
            }
          }
        }}
        onPlaying={() => {
          if (activeDeckRef.current === 'A') {
            setIsAudioBuffering(false);
            setHasAudioStarted(true);
            setIsPlaying(true);
            onPlayStateChange?.(true);
            consecutiveErrorsRef.current = 0;
            requestWakeLock();
            initWebAudioKeepAlive();
            prepareNextTrack();
          }
        }}
        onPause={() => {
          if (activeDeckRef.current === 'A' && !isTransitioningRef.current) {
            onPlayStateChange?.(false);
          }
        }}
        onTimeUpdate={(e) => {
          if (activeDeckRef.current === 'A') {
            const ct = e.currentTarget.currentTime;
            setCurrentTime(Math.floor(ct));
            if (ct > 0 && !hasAudioStarted) {
              setHasAudioStarted(true);
              setIsAudioBuffering(false);
            }
          }
        }}
        onDurationChange={(e) => {
          if (activeDeckRef.current === 'A') {
            const d = e.currentTarget.duration;
            if (d && !isNaN(d) && d > 0) {
              setDuration(Math.floor(d));
            }
          }
        }}
        onWaiting={() => {
          if (activeDeckRef.current === 'A') {
            setIsAudioBuffering(true);
          }
        }}
        onEnded={() => {
          if (activeDeckRef.current === 'A') {
            handleEnded();
          }
        }}
        onError={() => {
          if (activeDeckRef.current === 'A') {
            handleEngineError();
          }
        }}
      />

      {/* DECK B: MOTOR NATIVO B (CROSSFADE CONTÍNUO SEM CORTE DE SOM) */}
      <audio
        ref={deckBRef}
        preload="auto"
        playsInline
        onCanPlay={() => {
          if (activeDeckRef.current === 'B') {
            setIsAudioBuffering(false);
            if (isPlaying) {
              deckBRef.current?.play().catch(() => {});
            }
          }
        }}
        onPlaying={() => {
          if (activeDeckRef.current === 'B') {
            setIsAudioBuffering(false);
            setHasAudioStarted(true);
            setIsPlaying(true);
            onPlayStateChange?.(true);
            consecutiveErrorsRef.current = 0;
            requestWakeLock();
            initWebAudioKeepAlive();
            prepareNextTrack();
          }
        }}
        onPause={() => {
          if (activeDeckRef.current === 'B' && !isTransitioningRef.current) {
            onPlayStateChange?.(false);
          }
        }}
        onTimeUpdate={(e) => {
          if (activeDeckRef.current === 'B') {
            const ct = e.currentTarget.currentTime;
            setCurrentTime(Math.floor(ct));
            if (ct > 0 && !hasAudioStarted) {
              setHasAudioStarted(true);
              setIsAudioBuffering(false);
            }
          }
        }}
        onDurationChange={(e) => {
          if (activeDeckRef.current === 'B') {
            const d = e.currentTarget.duration;
            if (d && !isNaN(d) && d > 0) {
              setDuration(Math.floor(d));
            }
          }
        }}
        onWaiting={() => {
          if (activeDeckRef.current === 'B') {
            setIsAudioBuffering(true);
          }
        }}
        onEnded={() => {
          if (activeDeckRef.current === 'B') {
            handleEnded();
          }
        }}
        onError={() => {
          if (activeDeckRef.current === 'B') {
            handleEngineError();
          }
        }}
      />

      {/* MODAL DE DOWNLOAD DIRETO DE MP3 COMPLETO (SEM 30s) */}
      {showDownloadModal && (
        <DownloadFullTrackModal
          track={{
            title: activeTrack.title,
            artist: activeTrack.artist,
            album: activeTrack.album,
            artwork: activeTrack.artwork,
            durationSeconds: duration,
            youtubeId: resolvedVideoId || undefined,
            previewUrl: activeTrack.previewUrl
          }}
          onClose={() => setShowDownloadModal(false)}
          onAddToLocalRepair={onAddToLocalRepair}
        />
      )}

      {/* MODAL DE INFORMAÇÕES COMPLETAS DA MÚSICA E ARTISTA AO CLICAR NA CAPA */}
      {showTrackInfoModal && (
        <TrackArtistInfoModal
          track={currentTrack}
          currentTime={currentTime}
          duration={duration}
          onClose={() => setShowTrackInfoModal(false)}
          onSearchArtist={onSearchArtist}
          onOpenDownloadModal={() => setShowDownloadModal(true)}
          onAddToQueue={(track) => {
            // Adiciona à fila de reprodução
            if (playlist && onTrackChange) {
              showToast(`🎵 "${track.title}" adicionada à fila!`);
            }
          }}
        />
      )}

      {/* MODAL DE KARAOKÊ E LETRAS SINCRONIZADAS EM TEMPO REAL */}
      {showKaraokeModal && (
        <KaraokeLyricsModal
          track={activeTrack}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onSeek={handleSeek}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={() => setShowKaraokeModal(false)}
        />
      )}


      {/* ========================================================= */}
      {/* ESTADO A: BOTÃO FLUTUANTE (MODO DISCRETO)                */}
      {/* ========================================================= */}
      {playerMode === 'floating_fab' && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-40 flex items-center gap-2 group/fab animate-in zoom-in-90 duration-200 select-none">
          {/* Mini-painel de controles rápidos que aparece no hover/foco */}
          <div className="hidden group-hover/fab:flex items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-full shadow-2xl animate-in slide-in-from-right-3 duration-150">
            {/* Play / Pause Rápido */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white flex items-center justify-center transition cursor-pointer"
              title={isPlaying ? "Pausar" : "Tocar"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            {/* Próxima */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Próxima faixa"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Controle de Volume Rápido */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 flex items-center justify-center transition cursor-pointer"
              title={isMuted ? "Desmutar som" : "Mutar som"}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Voltar para o Modo Rodapé */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlayerMode('footer');
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition cursor-pointer"
              title="Restaurar Player de Rodapé"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>

            {/* Fechar Música Totalmente */}
            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-rose-950/60 hover:bg-rose-900 text-rose-300 flex items-center justify-center transition cursor-pointer border border-rose-800/40"
                title="Encerrar áudio"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* O Vinil Giratório Flutuante (Toque Principal = Abre Player Expandido Tela Cheia) */}
          <button
            type="button"
            onClick={() => setPlayerMode('expanded')}
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-1 bg-slate-900 border-2 border-emerald-500/80 hover:border-emerald-400 shadow-2xl shadow-emerald-950/60 ring-4 ring-black/70 cursor-pointer transition-transform duration-200 active:scale-95 group/disc hover:scale-105"
            title="Tocando agora • Toque para expandir em Tela Cheia"
          >
            {/* Vinil com capa girando */}
            <div
              className={`w-full h-full rounded-full overflow-hidden bg-slate-950 relative flex items-center justify-center ${
                isPlaying && !isAudioBuffering ? 'animate-[spin_4s_linear_infinite]' : ''
              }`}
              style={{
                animationPlayState: isPlaying && !isAudioBuffering ? 'running' : 'paused'
              }}
            >
              {activeTrack.artwork && activeTrack.artwork.trim() !== '' ? (
                <img
                  src={activeTrack.artwork}
                  alt={activeTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-6 h-6 text-emerald-400" />
              )}

              {/* Ranhuras de vinil */}
              <div className="absolute inset-0 rounded-full border border-black/40 pointer-events-none" />
              <div className="absolute inset-1.5 rounded-full border border-white/10 pointer-events-none" />
              <div className="absolute inset-3 rounded-full border border-black/30 pointer-events-none" />

              {/* Centro do disco de vinil */}
              <div className="absolute w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-emerald-400 shadow-inner flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-emerald-300" />
              </div>
            </div>

            {/* Badge de Equalizer / Onda Sonora no Canto */}
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center gap-0.5 shadow-md border border-slate-900">
              <span className={`w-0.5 bg-slate-950 rounded-full h-2 ${isPlaying && !isAudioBuffering ? 'animate-[pulse_0.6s_ease-in-out_infinite]' : 'h-1'}`} />
              <span className={`w-0.5 bg-slate-950 rounded-full h-3 ${isPlaying && !isAudioBuffering ? 'animate-[pulse_0.9s_ease-in-out_infinite]' : 'h-1.5'}`} />
              <span className={`w-0.5 bg-slate-950 rounded-full h-2 ${isPlaying && !isAudioBuffering ? 'animate-[pulse_0.7s_ease-in-out_infinite]' : 'h-1'}`} />
            </div>

            {/* Indicador de Carregando */}
            {isAudioBuffering && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              </div>
            )}
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* ESTADO B: PLAYER EXPANDIDO (MODO TELA CHEIA / IMERSIVO)   */}
      {/* ========================================================= */}
      {playerMode === 'expanded' && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 md:p-8 animate-in slide-in-from-bottom duration-300 overflow-y-auto select-none">
          {/* Aura ambiente suave colorida com blur no fundo */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-[480px] h-80 sm:h-[480px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* 1. CABEÇALHO SUPERIOR */}
          <div className="w-full max-w-lg mx-auto flex items-center justify-between z-10 shrink-0">
            {/* Botão [v] Minimizar para Rodapé */}
            <button
              onClick={() => setPlayerMode('footer')}
              className="p-2 text-slate-300 hover:text-white rounded-2xl hover:bg-slate-900 border border-slate-800 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer group shadow-sm"
              title="Minimizar para o Player de Rodapé [v]"
            >
              <ChevronDown className="w-5 h-5 group-hover:translate-y-0.5 transition" />
              <span className="hidden sm:inline">Minimizar</span>
            </button>

            {/* Título Central */}
            <div className="text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 block">
                Tocando Agora
              </span>
              <span className="text-xs font-black text-white">
                Audio<span className="text-emerald-400">Flix</span>
              </span>
            </div>

            {/* Ações Topo Direito: Modo Discreto (Botão Flutuante) e Fechar Total */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPlayerMode('floating_fab')}
                className="p-2 text-slate-300 hover:text-emerald-300 rounded-2xl hover:bg-slate-900 border border-slate-800 transition flex items-center gap-1 text-xs font-semibold cursor-pointer shadow-sm"
                title="Ativar Modo Discreto (Botão Flutuante)"
              >
                <Disc3 className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Discreto</span>
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-white rounded-2xl hover:bg-slate-900 border border-slate-800 transition cursor-pointer"
                  title="Encerrar áudio completamente"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 2. ÁREA CENTRAL: CAPA DO ÁLBUM EM ALTA RESOLUÇÃO */}
          <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center my-auto py-4 z-10 space-y-4 sm:space-y-6">
            
            {/* Capa de Álbum em Alta Resolução */}
            <div className="relative group/art">
              <div className="w-60 h-60 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-3xl overflow-hidden shadow-2xl shadow-black/80 border-2 border-slate-800 bg-slate-900 relative">
                {activeTrack.artwork && activeTrack.artwork.trim() !== '' ? (
                  <img
                    src={activeTrack.artwork}
                    alt={activeTrack.title}
                    className="w-full h-full object-cover group-hover/art:scale-105 transition duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                    <Music className="w-16 h-16" />
                  </div>
                )}

                {isAudioBuffering && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  </div>
                )}
              </div>

              {/* Sombra de reflexo sob a capa */}
              <div className="absolute -bottom-3 left-6 right-6 h-4 bg-emerald-500/20 blur-xl rounded-full" />
            </div>

            {/* Informações da Música: Título e Artista */}
            <div className="w-full text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate max-w-full px-2">
                {activeTrack.title}
              </h2>
              <p className="text-sm font-semibold text-emerald-400/90 truncate max-w-full px-2">
                {activeTrack.artist} {activeTrack.album ? `• ${activeTrack.album}` : ''}
              </p>
            </div>

            {/* 3. BARRA DE UTILITÁRIOS: DISCRETOS, SEM MOLDURA PESADA */}
            <div className="flex items-center justify-around w-full max-w-sm mx-auto pt-1 px-1">
              {/* Letra / Karaokê */}
              <button
                type="button"
                onClick={() => setShowKaraokeModal(true)}
                className="flex flex-col items-center justify-center gap-1 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer active:scale-95 group"
                title="Abrir Letra & Karaokê Sincronizado"
              >
                <Mic2 className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-300 group-hover:text-emerald-400" />
                <span className="text-[10px] font-semibold">Letra</span>
              </button>

              {/* Baixar MP3 */}
              <button
                type="button"
                onClick={() => setShowDownloadModal(true)}
                className="flex flex-col items-center justify-center gap-1 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer active:scale-95 group"
                title="Baixar MP3 completo"
              >
                <Download className="w-4 h-4 group-hover:scale-110 transition-transform text-slate-300 group-hover:text-emerald-400" />
                <span className="text-[10px] font-semibold">Baixar</span>
              </button>

              {/* Amor / Favoritar */}
              <button
                type="button"
                onClick={() => toggleFavorite(activeTrack as any)}
                className={`flex flex-col items-center justify-center gap-1 p-1 transition cursor-pointer active:scale-95 group ${
                  isFav ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400'
                }`}
                title="Adicionar ou remover das favoritas"
              >
                <Heart className={`w-4 h-4 group-hover:scale-110 transition-transform ${isFav ? 'fill-current text-rose-500' : 'text-slate-300 group-hover:text-rose-400'}`} />
                <span className="text-[10px] font-semibold">{isFav ? 'Salvo' : 'Favoritar'}</span>
              </button>

              {/* Fila / Lista */}
              <button
                type="button"
                onClick={() => setIsQueueOpen(!isQueueOpen)}
                className={`flex flex-col items-center justify-center gap-1 p-1 transition cursor-pointer active:scale-95 group ${
                  isQueueOpen ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                }`}
                title="Abrir fila de reprodução"
              >
                <div className="relative">
                  <ListMusic className={`w-4 h-4 group-hover:scale-110 transition-transform ${isQueueOpen ? 'text-emerald-400' : 'text-slate-300 group-hover:text-emerald-400'}`} />
                  {queue.length > 0 && (
                    <span className="absolute -top-1 -right-2 px-1 text-[8px] font-bold bg-emerald-500 text-slate-950 rounded-full font-mono">
                      {queue.length}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">Fila</span>
              </button>
            </div>
          </div>

          {/* 4. CONTROLES INFERIORES: TIMELINE E BOTÕES DE REPRODUÇÃO */}
          <div className="w-full max-w-md mx-auto space-y-4 z-10 shrink-0 pb-2">
            
            {/* Timeline com Scrubbable Slider */}
            <div className="space-y-1.5">
              <div className="relative group w-full h-2 cursor-pointer bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.min(100, Math.max(0, (currentTime / (duration || 1)) * 100))}%`
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 180}
                  value={hasAudioStarted ? currentTime : 0}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controles Ergonômicos Principais */}
            <div className="flex items-center justify-between px-4 sm:px-6">
              {/* Repetir */}
              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2.5 rounded-full transition cursor-pointer ${
                  isLooping ? 'text-emerald-400 bg-emerald-500/20' : 'text-slate-400 hover:text-white'
                }`}
                title="Repetir música"
              >
                <Repeat className="w-5 h-5" />
              </button>

              {/* Faixa Anterior */}
              <button
                onClick={handlePrev}
                className="p-3 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                title="Faixa anterior"
              >
                <SkipBack className="w-7 h-7" />
              </button>

              {/* Botão Play / Pause Destaque Central */}
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition shadow-2xl shadow-emerald-500/40 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
              >
                {isAudioBuffering && !isPlaying ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-1" />
                )}
              </button>

              {/* Próxima Faixa */}
              <button
                onClick={handleNext}
                className="p-3 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                title="Próxima faixa"
              >
                <SkipForward className="w-7 h-7" />
              </button>

              {/* Recolher direto para Modo Discreto */}
              <button
                onClick={() => setPlayerMode('floating_fab')}
                className="p-2.5 text-slate-400 hover:text-emerald-400 rounded-full transition cursor-pointer"
                title="Minimizar para Botão Flutuante Discreto"
              >
                <Disc3 className="w-5 h-5" />
              </button>
            </div>

            {/* Controle de Volume no Modo Expandido (Sempre Visível) */}
            <div className="flex items-center justify-center gap-3 pt-3 max-w-xs mx-auto text-slate-300">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 hover:text-emerald-400 transition cursor-pointer"
                title={isMuted ? 'Desmutar' : 'Mutar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-slate-300" />
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
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (isMuted && val > 0) setIsMuted(false);
                }}
                className="w-36 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                title={`Volume: ${isMuted ? 0 : volume}%`}
              />
              <span className="text-[11px] font-mono text-slate-400 w-8 text-right select-none">
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ESTADO C: PLAYER DE RODAPÉ (MODO MULTITAREFA)             */}
      {/* ========================================================= */}
      {playerMode === 'footer' && (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 shadow-2xl text-slate-100 transition-all duration-200">
        
        {/* BANNER DE TRANSIÇÃO SUAVE OU BUFFERING */}
        {isTransitioning ? (
          <div className="bg-gradient-to-r from-emerald-950/95 via-slate-900 to-slate-950 border-b border-emerald-500/30 px-3.5 py-1 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2 truncate">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
              <span className="truncate">
                Transição suave: mantendo <strong className="text-slate-200 font-medium">{outgoingTrackTitle || 'faixa atual'}</strong> enquanto conecta: <strong className="text-white font-bold">{activeTrack.title}</strong>...
              </span>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shrink-0 ml-2 flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Crossfade
            </span>
          </div>
        ) : isAudioBuffering && !hasAudioStarted ? (
          <div className="bg-gradient-to-r from-emerald-950/95 via-slate-900 to-slate-950 border-b border-emerald-500/30 px-3.5 py-1 text-xs text-emerald-300 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2 truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
              <span className="truncate">
                Conectando áudio: <strong className="text-white font-bold">{activeTrack.title}</strong> — <em>iniciando reprodução...</em>
              </span>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shrink-0 ml-2">
              Áudio Direto
            </span>
          </div>
        ) : null}

        {/* Barra de Progresso Scrubbable no Topo da Dock */}
        <div className="relative group w-full h-2 cursor-pointer bg-slate-900 overflow-hidden">
          {(!hasAudioStarted || (isAudioBuffering && !isTransitioning)) && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent animate-[shimmer_1.5s_infinite] pointer-events-none" />
          )}
          <div
            className={`h-full relative transition-all duration-200 ${
              !hasAudioStarted && isAudioBuffering
                ? 'bg-slate-700/40'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400'
            }`}
            style={{
              width: `${
                !hasAudioStarted && isAudioBuffering
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
          
          {/* Lado Esquerdo: Capa, Título, Artista (Toque expande para Tela Cheia) */}
          <div className="flex items-center gap-3 min-w-0 max-w-xs sm:max-w-sm">
            {/* Capa com clique para abrir Player Expandido Tela Cheia */}
            <button
              type="button"
              onClick={() => setPlayerMode('expanded')}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-emerald-500/70 shrink-0 shadow-md relative group cursor-pointer transition-all hover:scale-105 active:scale-95 text-left"
              title="Toque na capa para abrir o Player Expandido (Tela Cheia)"
            >
              {activeTrack.artwork && activeTrack.artwork.trim() !== '' ? (
                <img
                  src={activeTrack.artwork}
                  alt={activeTrack.title}
                  className="w-full h-full object-cover transition-opacity group-hover:opacity-85"
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
              {/* Overlay para expandir ao passar mouse */}
              <div className="absolute inset-0 bg-emerald-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Maximize2 className="w-4 h-4 text-emerald-300 drop-shadow" />
              </div>
            </button>

            <div
              className="min-w-0 flex-1 cursor-pointer group/info"
              onClick={() => setPlayerMode('expanded')}
              title="Toque para abrir o Player Expandido (Tela Cheia)"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-white group-hover/info:text-emerald-400 truncate block transition-colors">
                  {activeTrack.title}
                </span>
                {isDeviceTrack ? (
                  <span className="hidden xs:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                    <Disc3 className="w-2.5 h-2.5 animate-spin" />
                    <span>Local</span>
                  </span>
                ) : (
                  <span className="hidden xs:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    <span>Áudio 100%</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs text-slate-400 truncate block">
                {activeTrack.artist} {activeTrack.album ? `• ${activeTrack.album}` : ''}
              </span>
            </div>

            {/* Botão de Favoritar */}
            <button
              onClick={() => toggleFavorite(activeTrack as any)}
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
              {/* Repetir */}
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
                {isAudioBuffering && !isPlaying ? (
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
            </div>

            {/* Display de Tempo Sincronizado */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono select-none">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              {isTransitioning ? (
                <span className="text-emerald-400 font-sans hidden sm:inline flex items-center gap-1">• Transição suave...</span>
              ) : !hasAudioStarted && isAudioBuffering ? (
                <span className="text-emerald-400 font-sans hidden sm:inline">• Conectando áudio...</span>
              ) : null}
            </div>
          </div>

          {/* Lado Direito: Ações Extras (Volume Desktop, Fila, Download MP3, Modo Discreto, Expandir, Fechar) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Controle de Volume Dedicado e Permanente no Desktop */}
            <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-inner">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 text-slate-300 hover:text-emerald-400 transition cursor-pointer"
                title={isMuted ? 'Desmutar som' : 'Mutar som'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-slate-200" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-200" />
                )}
              </button>
              <div className="w-14 sm:w-18 md:w-24 relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    if (isMuted && val > 0) setIsMuted(false);
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                  title={`Volume: ${isMuted ? 0 : volume}%`}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400 w-6 text-right select-none hidden sm:inline">
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>

            {/* Letra / Karaokê */}
            <button
              onClick={() => setShowKaraokeModal(true)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer flex items-center gap-1"
              title="Abrir Letra & Karaokê Sincronizado"
            >
              <Mic2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <span className="hidden xl:inline text-xs font-semibold">Letra</span>
            </button>

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

            {/* Botão Baixar Música Completa MP3 */}
            <button
              onClick={() => setShowDownloadModal(true)}
              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Baixar MP3 100% completo no dispositivo"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar MP3</span>
            </button>

            {/* BOTÃO MODO DISCRETO (ESTADO A: BOTÃO FLUTUANTE) */}
            <button
              onClick={() => setPlayerMode('floating_fab')}
              className="p-1.5 text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1 border border-slate-800 hover:border-emerald-500/40"
              title="Minimizar para Botão Flutuante Discreto (Vinil)"
            >
              <Disc3 className="w-4 h-4 text-emerald-400" />
              <span className="hidden lg:inline text-xs font-semibold">Discreto</span>
            </button>

            {/* BOTÃO EXPANDIR PARA TELA CHEIA (ESTADO B) */}
            <button
              onClick={() => setPlayerMode('expanded')}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Expandir para Modo Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Fechar Player com [X] (Encerra o áudio completamente) */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-rose-950/60 hover:text-rose-300 transition cursor-pointer border border-transparent hover:border-rose-800/40"
                title="Encerrar áudio e fechar o player [X]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </div>
      )}
    </>
  );
}
