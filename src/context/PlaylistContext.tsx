import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  addToQueue: (track: PlaylistTrack) => void;
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
}

const FAVORITES_STORAGE_KEY = 'audioflix_favorites_v1';
const PLAYLISTS_STORAGE_KEY = 'audioflix_playlists_v1';
const QUEUE_STORAGE_KEY = 'audioflix_queue_v1';
const DOWNLOADS_STORAGE_KEY = 'audioflix_downloads_history_v1';

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
              coverUrl: filtered[0]?.artwork,
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

  const addToQueue = useCallback((track: PlaylistTrack) => {
    setQueue((prev) => [...prev, track]);
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
        addToQueue,
        playNext,
        removeFromQueue,
        reorderQueue,
        clearQueue,
        setQueueTracks,
        saveQueueAsPlaylist,
        downloads,
        addDownloadRecord,
        removeDownloadRecord,
        clearDownloadHistory
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
