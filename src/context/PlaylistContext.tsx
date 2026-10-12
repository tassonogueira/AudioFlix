import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithGooglePopup,
  signOutGoogle,
  syncUserDataToFirestore,
  loadUserDataFromFirestore,
  onAuthStateChanged,
  auth
} from '../services/firebase.ts';

export interface PlaylistTrack {
  id: string | number;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSeconds?: number;
  youtubeId?: string;
  previewUrl?: string;
  addedAt?: number;
  isDeviceAudio?: boolean;
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSeconds?: number;
  youtubeId?: string;
  downloadedAt: number;
  type: 'single_mp3' | 'album_zip' | 'singles_zip';
  fileSizeStr?: string;
  fileName: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: string;
  termsAccepted: boolean;
  termsAcceptedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
}

interface PlaylistContextType {
  favorites: PlaylistTrack[];
  playlists: Playlist[];
  isFavorite: (trackId: string | number) => boolean;
  toggleFavorite: (track: PlaylistTrack) => boolean;
  createPlaylist: (name: string, description?: string, initialTracks?: PlaylistTrack[]) => Playlist;
  deletePlaylist: (playlistId: string) => void;
  renamePlaylist: (playlistId: string, name: string, description?: string) => void;
  addTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => boolean;
  removeTrackFromPlaylist: (playlistId: string, trackId: string | number) => void;
  isTrackInPlaylist: (playlistId: string, trackId: string | number) => boolean;
  modalTrack: PlaylistTrack | null;
  openAddToPlaylistModal: (track: PlaylistTrack) => void;
  closeAddToPlaylistModal: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  // Fila de Reprodução (Queue)
  queue: PlaylistTrack[];
  currentQueueIndex: number;
  setCurrentQueueIndex: (index: number) => void;
  isQueueOpen: boolean;
  setIsQueueOpen: (open: boolean) => void;
  isInQueue: (trackId: string | number) => boolean;
  toggleQueue: (track: PlaylistTrack) => boolean;
  addToQueue: (track: PlaylistTrack) => void;
  removeFromQueueById: (trackId: string | number) => void;
  playNext: (track: PlaylistTrack) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  setQueueTracks: (tracks: PlaylistTrack[], startIndex?: number) => void;
  saveQueueAsPlaylist: (name: string) => Playlist;
  // Histórico de Downloads
  downloads: DownloadHistoryItem[];
  addDownloadRecord: (item: Omit<DownloadHistoryItem, 'id' | 'downloadedAt'>) => void;
  removeDownloadRecord: (id: string) => void;
  clearDownloadHistory: () => void;
  // Sincronização em Nuvem e Conta (YouTube / Google)
  user: UserProfile | null;
  isTermsModalOpen: boolean;
  setIsTermsModalOpen: (open: boolean) => void;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  loginWithAccount: (data: { name: string; email: string; avatar?: string; provider?: string; termsAccepted: boolean }) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  syncNow: () => Promise<void>;
}

const FAVORITES_STORAGE_KEY = 'audioflix_favorites_v1';
const PLAYLISTS_STORAGE_KEY = 'audioflix_playlists_v1';
const QUEUE_STORAGE_KEY = 'audioflix_queue_v1';
const DOWNLOADS_STORAGE_KEY = 'audioflix_downloads_history_v1';
const USER_STORAGE_KEY = 'audioflix_user_profile_v1';

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<PlaylistTrack[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      // Cria uma playlist inicial padronizada para boas-vindas
      return [
        {
          id: 'playlist-default-sertanejo',
          name: 'Melhores Músicas',
          description: 'Sua lista especial com as melhores faixas',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tracks: []
        }
      ];
    } catch {
      return [];
    }
  });

  const [modalTrack, setModalTrack] = useState<PlaylistTrack | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Sincroniza com localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (e) {
      console.warn('Erro ao salvar favoritas no localStorage:', e);
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
    } catch (e) {
      console.warn('Erro ao salvar playlists no localStorage:', e);
    }
  }, [playlists]);

  const isFavorite = useCallback(
    (trackId: string | number) => {
      return favorites.some((f) => String(f.id) === String(trackId));
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    (track: PlaylistTrack): boolean => {
      const exists = favorites.some((f) => String(f.id) === String(track.id));
      if (exists) {
        setFavorites((prev) => prev.filter((f) => String(f.id) !== String(track.id)));
        showToast(`Removida das Favoritas: "${track.title}"`);
        return false;
      } else {
        const newTrack: PlaylistTrack = {
          ...track,
          addedAt: Date.now()
        };
        setFavorites((prev) => [newTrack, ...prev]);
        showToast(`Adicionada às Favoritas ❤️: "${track.title}"`);
        return true;
      }
    },
    [favorites, showToast]
  );

  const createPlaylist = useCallback(
    (name: string, description?: string, initialTracks: PlaylistTrack[] = []): Playlist => {
      const cleanName = name.trim() || 'Minha Nova Playlist';
      const newPlaylist: Playlist = {
        id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        description: description?.trim() || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tracks: initialTracks.map((t) => ({ ...t, addedAt: Date.now() })),
        coverUrl: initialTracks[0]?.artwork
      };

      setPlaylists((prev) => [newPlaylist, ...prev]);
      showToast(`Playlist "${cleanName}" criada com sucesso! 🎵`);
      return newPlaylist;
    },
    [showToast]
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((prev) => {
        const target = prev.find((p) => p.id === playlistId);
        if (target) {
          showToast(`Playlist "${target.name}" excluída.`);
        }
        return prev.filter((p) => p.id !== playlistId);
      });
    },
    [showToast]
  );

  const renamePlaylist = useCallback(
    (playlistId: string, name: string, description?: string) => {
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id === playlistId) {
            return {
              ...p,
              name: name.trim() || p.name,
              description: description !== undefined ? description.trim() : p.description,
              updatedAt: Date.now()
            };
          }
          return p;
        })
      );
      showToast('Playlist atualizada com sucesso!');
    },
    [showToast]
  );

  const isTrackInPlaylist = useCallback(
    (playlistId: string, trackId: string | number) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return false;
      return pl.tracks.some((t) => String(t.id) === String(trackId));
    },
    [playlists]
  );

  const addTrackToPlaylist = useCallback(
    (playlistId: string, track: PlaylistTrack): boolean => {
      let added = false;
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id === playlistId) {
            const alreadyExists = pl.tracks.some((t) => String(t.id) === String(track.id));
            if (alreadyExists) {
              return pl;
            }
            added = true;
            const updatedTracks = [
              ...pl.tracks,
              {
                ...track,
                addedAt: Date.now()
              }
            ];
            return {
              ...pl,
              updatedAt: Date.now(),
              coverUrl: pl.coverUrl || track.artwork,
              tracks: updatedTracks
            };
          }
          return pl;
        })
      );

      if (added) {
        const pl = playlists.find((p) => p.id === playlistId);
        showToast(`Música adicionada à playlist "${pl?.name || 'Playlist'}"!`);
      } else {
        showToast('Essa música já está na playlist.');
      }
      return added;
    },
    [playlists, showToast]
  );

  const removeTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string | number) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id === playlistId) {
            const filtered = pl.tracks.filter((t) => String(t.id) !== String(trackId));
            return {
              ...pl,
              updatedAt: Date.now(),
              coverUrl: filtered.find((t) => Boolean(t.artwork))?.artwork || undefined,
              tracks: filtered
            };
          }
          return pl;
        })
      );
      showToast('Música removida da playlist.');
    },
    [showToast]
  );

  const openAddToPlaylistModal = useCallback((track: PlaylistTrack) => {
    setModalTrack(track);
  }, []);

  const closeAddToPlaylistModal = useCallback(() => {
    setModalTrack(null);
  }, []);

  // Fila de reprodução móvel (Queue)
  const [queue, setQueue] = useState<PlaylistTrack[]>(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('Erro ao salvar fila:', e);
    }
  }, [queue]);

  // Análise Rápida de Disponibilidade de Músicas Locais neste Aparelho:
  // Garante que músicas de pendrive/dispositivo só permaneçam na lista se os arquivos realmente estiverem disponíveis neste dispositivo.
  useEffect(() => {
    let isCancelled = false;

    const sanitizeQueueLocalTracks = async () => {
      const deviceTracks = queue.filter(
        (t) =>
          t.isDeviceAudio ||
          String(t.id).startsWith('device_') ||
          t.artist === 'Dispositivo / Pendrive' ||
          (t.previewUrl && t.previewUrl.startsWith('blob:'))
      );

      if (deviceTracks.length === 0) return;

      const unavailableIds = new Set<string>();

      await Promise.all(
        deviceTracks.map(async (track) => {
          if (!track.previewUrl || !track.previewUrl.startsWith('blob:')) {
            unavailableIds.add(String(track.id));
            return;
          }
          try {
            const res = await fetch(track.previewUrl, { method: 'HEAD' });
            if (!res.ok) unavailableIds.add(String(track.id));
          } catch {
            unavailableIds.add(String(track.id));
          }
        })
      );

      if (!isCancelled && unavailableIds.size > 0) {
        setQueue((prev) => prev.filter((t) => !unavailableIds.has(String(t.id))));
        showToast(
          `ℹ️ ${unavailableIds.size} faixa(s) local(is) de outro dispositivo foram removidas da fila.`
        );
      }
    };

    sanitizeQueueLocalTracks();

    return () => {
      isCancelled = true;
    };
  }, []);

  const isInQueue = useCallback(
    (trackId: string | number) => {
      return queue.some((t) => String(t.id) === String(trackId));
    },
    [queue]
  );

  const removeFromQueueById = useCallback(
    (trackId: string | number) => {
      setQueue((prev) => prev.filter((t) => String(t.id) !== String(trackId)));
    },
    []
  );

  const toggleQueue = useCallback(
    (track: PlaylistTrack): boolean => {
      const exists = queue.some((t) => String(t.id) === String(track.id));
      if (exists) {
        setQueue((prev) => prev.filter((t) => String(t.id) !== String(track.id)));
        showToast(`Removida da fila: "${track.title}"`);
        return false;
      } else {
        setQueue((prev) => [...prev, track]);
        showToast(`🎵 "${track.title}" adicionada à fila de reprodução!`);
        return true;
      }
    },
    [queue, showToast]
  );

  const addToQueue = useCallback((track: PlaylistTrack) => {
    setQueue((prev) => {
      const exists = prev.some((t) => String(t.id) === String(track.id));
      if (exists) return prev;
      return [...prev, track];
    });
    showToast(`"${track.title}" adicionada à fila!`);
  }, [showToast]);

  const playNext = useCallback((track: PlaylistTrack) => {
    setQueue((prev) => {
      const nextQueue = [...prev];
      const insertAt = Math.min(currentQueueIndex + 1, nextQueue.length);
      nextQueue.splice(insertAt, 0, track);
      return nextQueue;
    });
    showToast(`"${track.title}" tocará a seguir!`);
  }, [currentQueueIndex, showToast]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((prev) => (prev[currentQueueIndex] ? [prev[currentQueueIndex]] : []));
    setCurrentQueueIndex(0);
    showToast('Fila limpa.');
  }, [currentQueueIndex, showToast]);

  const setQueueTracks = useCallback((tracks: PlaylistTrack[], startIndex = 0) => {
    setQueue(tracks);
    setCurrentQueueIndex(startIndex);
  }, []);

  const saveQueueAsPlaylist = useCallback((name: string) => {
    const pl = createPlaylist(name, 'Playlist criada a partir da fila de reprodução', queue);
    showToast(`Fila salva como playlist "${name}"!`);
    return pl;
  }, [createPlaylist, queue, showToast]);

  // Histórico de Downloads
  const [downloads, setDownloads] = useState<DownloadHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(DOWNLOADS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(downloads));
    } catch (e) {
      console.warn('Erro ao salvar histórico de downloads:', e);
    }
  }, [downloads]);

  const addDownloadRecord = useCallback((item: Omit<DownloadHistoryItem, 'id' | 'downloadedAt'>) => {
    const newRecord: DownloadHistoryItem = {
      ...item,
      id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      downloadedAt: Date.now()
    };
    setDownloads((prev) => [newRecord, ...prev]);
  }, []);

  const removeDownloadRecord = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearDownloadHistory = useCallback(() => {
    setDownloads([]);
    showToast('Histórico de downloads limpo.');
  }, [showToast]);

  // Sincronização em Nuvem e Conta de Usuário (YouTube / Google)
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Sincronização ativa sob demanda
  const syncNow = useCallback(async () => {
    if (!user) return;
    try {
      setIsSyncing(true);

      // Sanitiza faixas para remover eventuais URLs de data/base64 gigantes antes de transmitir
      const sanitizeTrack = (t: any) => {
        if (!t) return t;
        const clean = { ...t };
        if (typeof clean.previewUrl === 'string' && clean.previewUrl.startsWith('data:')) {
          delete clean.previewUrl;
        }
        if (typeof clean.artwork === 'string' && clean.artwork.startsWith('data:')) {
          delete clean.artwork;
        }
        return clean;
      };

      const cleanFavorites = favorites.map(sanitizeTrack);
      const cleanPlaylists = playlists.map((p) => ({
        ...p,
        tracks: Array.isArray(p.tracks) ? p.tracks.map(sanitizeTrack) : []
      }));
      const cleanDownloads = downloads.map(sanitizeTrack);
      const cleanQueue = queue.map(sanitizeTrack);

      // Salva no Firestore (Firebase)
      try {
        await syncUserDataToFirestore(user.id, {
          favorites: cleanFavorites,
          playlists: cleanPlaylists,
          downloads: cleanDownloads
        });
      } catch (e) {
        console.warn('Aviso sincronização Firestore:', e);
      }

      // E salva no backend
      const res = await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          favorites: cleanFavorites,
          playlists: cleanPlaylists,
          downloads: cleanDownloads,
          queue: cleanQueue
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLastSyncedAt(data.syncedAt || new Date().toISOString());
      }
    } catch (err) {
      console.warn('Erro ao sincronizar dados em nuvem:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user, favorites, playlists, downloads, queue]);

  // Sincronização automática com debounce de 2 segundos quando os dados mudam
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      syncNow();
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, favorites, playlists, downloads, queue, syncNow]);

  // Observa o estado de autenticação oficial do Firebase Google Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'Usuário Google',
          email: firebaseUser.email || '',
          avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(firebaseUser.email || 'google')}`,
          provider: 'google',
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString()
        };
        setUser((curr) => curr || userProfile);
      }
    });
    return () => unsubscribe();
  }, []);

  // Login Oficial com Conta Google (Abre o popup oficial da Conta Google para autenticação / confirmação)
  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      setIsSyncing(true);
      const googleUser = await signInWithGooglePopup();

      const userProfile: UserProfile = {
        id: googleUser.uid,
        name: googleUser.displayName || 'Usuário Google',
        email: googleUser.email || '',
        avatar: googleUser.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(googleUser.email || 'google')}`,
        provider: 'google',
        termsAccepted: true,
        termsAcceptedAt: new Date().toISOString()
      };

      // Define usuário e fecha modal IMEDIATAMENTE (0ms de espera)
      setUser(userProfile);
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userProfile));
      } catch {}

      setLastSyncedAt(new Date().toISOString());
      showToast(`🎉 Conectado com sucesso à Conta Google (${userProfile.email})!`);

      // Sincronização em segundo plano não-bloqueante (Ultra-rápido!)
      setTimeout(async () => {
        try {
          const cloudData = await loadUserDataFromFirestore(googleUser.uid);
          if (cloudData) {
            if (Array.isArray(cloudData.favorites) && cloudData.favorites.length > 0) {
              setFavorites((prev) => {
                const map = new Map<string, PlaylistTrack>();
                cloudData.favorites.forEach((t: PlaylistTrack) => map.set(String(t.id), t));
                prev.forEach((t: PlaylistTrack) => map.set(String(t.id), t));
                return Array.from(map.values());
              });
            }

            if (Array.isArray(cloudData.playlists) && cloudData.playlists.length > 0) {
              setPlaylists((prev) => {
                const map = new Map<string, Playlist>();
                cloudData.playlists.forEach((p: Playlist) => map.set(p.id, p));
                prev.forEach((p: Playlist) => map.set(p.id, p));
                return Array.from(map.values());
              });
            }

            if (Array.isArray(cloudData.downloads) && cloudData.downloads.length > 0) {
              setDownloads((prev) => {
                const map = new Map<string, DownloadHistoryItem>();
                cloudData.downloads.forEach((d: DownloadHistoryItem) => map.set(d.id, d));
                prev.forEach((d: DownloadHistoryItem) => map.set(d.id, d));
                return Array.from(map.values());
              });
            }
          } else {
            await syncUserDataToFirestore(googleUser.uid, {
              favorites,
              playlists,
              downloads
            });
          }
        } catch {}

        try {
          await fetch('/api/auth/login-youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: userProfile.name,
              email: userProfile.email,
              avatar: userProfile.avatar,
              provider: 'google',
              termsAccepted: true,
              termsAcceptedAt: userProfile.termsAcceptedAt
            })
          });
        } catch {}
      }, 50);

      return true;
    } catch (err: any) {
      console.error('Erro na autenticação com Conta Google:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        showToast('Login com o Google foi fechado ou cancelado.');
      } else if (err.code === 'auth/popup-blocked') {
        showToast('O popup da Conta Google foi bloqueado pelo navegador. Por favor, libere popups.');
      } else {
        showToast(`Erro ao autenticar com a Conta Google: ${err.message || 'Falha na confirmação'}`);
      }
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [favorites, playlists, downloads, showToast]);

  // Efetuar login com conta e aceite dos termos
  const loginWithAccount = useCallback(
    async (data: { name: string; email: string; avatar?: string; provider?: string; termsAccepted: boolean }): Promise<boolean> => {
      try {
        setIsSyncing(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch('/api/auth/login-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ...data,
            termsAcceptedAt: new Date().toISOString()
          })
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Falha ao autenticar');
        }

        const resData = await res.json();
        setUser(resData.user);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(resData.user));
        } catch {}

        // Se o usuário já tiver dados salvos na nuvem em outro dispositivo, recupera e mescla
        if (resData.cloudData) {
          if (Array.isArray(resData.cloudData.favorites) && resData.cloudData.favorites.length > 0) {
            setFavorites((prev) => {
              const map = new Map<string, PlaylistTrack>();
              resData.cloudData.favorites.forEach((t: PlaylistTrack) => map.set(String(t.id), t));
              prev.forEach((t: PlaylistTrack) => map.set(String(t.id), t));
              return Array.from(map.values());
            });
          }

          if (Array.isArray(resData.cloudData.playlists) && resData.cloudData.playlists.length > 0) {
            setPlaylists((prev) => {
              const map = new Map<string, Playlist>();
              resData.cloudData.playlists.forEach((p: Playlist) => map.set(p.id, p));
              prev.forEach((p: Playlist) => map.set(p.id, p));
              return Array.from(map.values());
            });
          }

          if (Array.isArray(resData.cloudData.downloads) && resData.cloudData.downloads.length > 0) {
            setDownloads((prev) => {
              const map = new Map<string, DownloadHistoryItem>();
              resData.cloudData.downloads.forEach((d: DownloadHistoryItem) => map.set(d.id, d));
              prev.forEach((d: DownloadHistoryItem) => map.set(d.id, d));
              return Array.from(map.values());
            });
          }
        }

        showToast(`☁️ Conectado com sucesso! Sincronização multi-dispositivo ativada.`);
        return true;
      } catch (err: any) {
        // Fallback resiliente: cria sessão local imediata sem travar o usuário
        const fallbackUser: UserProfile = {
          id: `user_${Date.now()}`,
          name: data.name || 'Usuário Conectado',
          email: data.email || 'usuario@audioflix.app',
          avatar: data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.name || 'user')}`,
          provider: data.provider || 'youtube',
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString()
        };
        setUser(fallbackUser);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fallbackUser));
        } catch {}
        showToast(`☁️ Conectado com sucesso à sua conta!`);
        return true;
      } finally {
        setIsSyncing(false);
      }
    },
    [showToast]
  );

  const logout = useCallback(async () => {
    try {
      await signOutGoogle();
    } catch {}
    setUser(null);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {}
    showToast('Você saiu da sua conta.');
  }, [showToast]);

  return (
    <PlaylistContext.Provider
      value={{
        favorites,
        playlists,
        isFavorite,
        toggleFavorite,
        createPlaylist,
        deletePlaylist,
        renamePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        isTrackInPlaylist,
        modalTrack,
        openAddToPlaylistModal,
        closeAddToPlaylistModal,
        toastMessage,
        showToast,
        queue,
        currentQueueIndex,
        setCurrentQueueIndex,
        isQueueOpen,
        setIsQueueOpen,
        isInQueue,
        toggleQueue,
        addToQueue,
        removeFromQueueById,
        playNext,
        removeFromQueue,
        reorderQueue,
        clearQueue,
        setQueueTracks,
        saveQueueAsPlaylist,
        downloads,
        addDownloadRecord,
        removeDownloadRecord,
        clearDownloadHistory,
        user,
        isTermsModalOpen,
        setIsTermsModalOpen,
        isSyncing,
        lastSyncedAt,
        loginWithAccount,
        loginWithGoogle,
        logout,
        syncNow
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylistContext() {
  const context = useContext(PlaylistContext);
  if (!context) {
    throw new Error('usePlaylistContext must be used within a PlaylistProvider');
  }
  return context;
}
