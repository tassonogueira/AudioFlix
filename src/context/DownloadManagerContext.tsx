import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface BackgroundDownloadTask {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  type: 'single_mp3' | 'album_zip' | 'singles_zip';
  progress: number; // 0 to 100
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'error' | 'cancelled';
  errorMsg?: string;
  fileName: string;
  trackCount?: number;
  tracks?: Array<{ title: string; artist?: string; youtubeId?: string }>;
  folderName?: string;
  youtubeId?: string;
  blob?: Blob;
  startedAt: number;
  completedAt?: number;
}

interface DownloadManagerContextType {
  activeDownloads: BackgroundDownloadTask[];
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  customFolderHandle: any;
  customFolderName: string | null;
  selectCustomFolder: () => Promise<boolean>;
  clearCustomFolder: () => void;
  startSingleTrackDownload: (track: {
    title: string;
    artist: string;
    youtubeId?: string;
    artwork?: string;
    album?: string;
  }) => void;
  startAlbumZipDownload: (album: {
    title: string;
    artist: string;
    artwork?: string;
    tracks: Array<{ title: string; artist?: string; youtubeId?: string }>;
  }) => void;
  startSinglesBatchDownload: (
    folderName: string,
    tracks: Array<{ title: string; artist: string; youtubeId?: string; artwork?: string }>
  ) => void;
  retryDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  clearCompleted: () => void;
  hasActiveDownloads: boolean;
  saveFileToDestination: (blob: Blob, fileName: string) => Promise<boolean>;
}

const DownloadManagerContext = createContext<DownloadManagerContextType | undefined>(undefined);

const FOLDER_STORAGE_KEY = 'audioflix_custom_folder_name_v1';

export function DownloadManagerProvider({
  children,
  onDownloadCompleteRecord,
  showToast
}: {
  children: React.ReactNode;
  onDownloadCompleteRecord?: (record: any) => void;
  showToast?: (msg: string) => void;
}) {
  const [activeDownloads, setActiveDownloads] = useState<BackgroundDownloadTask[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [customFolderHandle, setCustomFolderHandle] = useState<any>(null);
  const [customFolderName, setCustomFolderName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(FOLDER_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const customFolderHandleRef = useRef<any>(null);
  customFolderHandleRef.current = customFolderHandle;

  // Selecionar pasta de destino personalizada via File System Access API
  const selectCustomFolder = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker({
          id: 'audioflix_downloads',
          mode: 'readwrite',
          startIn: 'music'
        });
        if (handle) {
          setCustomFolderHandle(handle);
          setCustomFolderName(handle.name);
          try {
            localStorage.setItem(FOLDER_STORAGE_KEY, handle.name);
          } catch {}
          if (showToast) showToast(`Pasta de destino definida: ${handle.name}`);
          return true;
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Erro ao abrir seletor de pasta:', err);
        }
      }
    } else {
      if (showToast) {
        showToast('Navegador sem suporte direto a pastas. Os arquivos serão salvos na pasta Downloads padrão.');
      }
    }
    return false;
  }, [showToast]);

  const clearCustomFolder = useCallback(() => {
    setCustomFolderHandle(null);
    setCustomFolderName(null);
    try {
      localStorage.removeItem(FOLDER_STORAGE_KEY);
    } catch {}
    if (showToast) showToast('Destino redefinido para a pasta Downloads padrão.');
  }, [showToast]);

  // Salvar arquivo no destino (na pasta selecionada ou via download tradicional)
  const saveFileToDestination = async (
    blob: Blob,
    fileName: string
  ): Promise<boolean> => {
    const handle = customFolderHandleRef.current;
    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (err) {
        console.warn('Falha ao gravar na pasta selecionada, usando download do navegador:', err);
      }
    }

    // Fallback: download clássico do navegador
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
      return true;
    } catch (err) {
      console.error('Falha no download via link:', err);
      return false;
    }
  };

  // Executa uma tarefa de download em segundo plano
  const executeDownloadTask = useCallback(
    async (task: BackgroundDownloadTask) => {
      const updateTask = (updates: Partial<BackgroundDownloadTask>) => {
        setActiveDownloads((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t))
        );
      };

      updateTask({ status: 'downloading', progress: 10, errorMsg: undefined });

      try {
        if (task.type === 'single_mp3') {
          const endpoint = task.youtubeId
            ? `/api/youtube/download?id=${encodeURIComponent(task.youtubeId)}&title=${encodeURIComponent(task.title)}&artist=${encodeURIComponent(task.artist)}`
            : `/api/music/download-full-track?title=${encodeURIComponent(task.title)}&artist=${encodeURIComponent(task.artist)}`;

          const response = await fetch(endpoint);
          if (!response.ok) {
            throw new Error(`Erro do servidor (${response.status}) ao buscar MP3`);
          }

          const contentLength = response.headers.get('content-length');
          const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

          if (!response.body) {
            const blob = await response.blob();
            if (blob.size < 100000 || blob.type.includes('json') || blob.type.includes('html')) {
              throw new Error('Arquivo de áudio inválido ou indisponível.');
            }
            await saveFileToDestination(blob, task.fileName);
            updateTask({ status: 'completed', progress: 100, completedAt: Date.now() });
            if (showToast) showToast(`Download concluído: ${task.title}`);
            if (onDownloadCompleteRecord) {
              onDownloadCompleteRecord({
                title: task.title,
                artist: task.artist,
                album: task.album,
                artwork: task.artwork,
                youtubeId: task.youtubeId,
                type: 'single_mp3',
                fileName: task.fileName
              });
            }
            return;
          }

          const reader = response.body.getReader();
          let receivedBytes = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes > 0) {
              const pct = Math.min(95, Math.round((receivedBytes / totalBytes) * 100));
              updateTask({ progress: pct });
            } else {
              const estPct = Math.min(90, Math.round((receivedBytes / 4500000) * 80));
              updateTask({ progress: Math.max(10, estPct) });
            }
          }

          const blob = new Blob(chunks as any, { type: 'audio/mpeg' });
          if (blob.size < 100000) {
            throw new Error('O arquivo MP3 gerado ficou corrompido ou incompleto.');
          }

          updateTask({ status: 'processing', progress: 98 });
          await saveFileToDestination(blob, task.fileName);
          updateTask({ status: 'completed', progress: 100, completedAt: Date.now() });

          if (showToast) showToast(`Música pronta: ${task.title} baixada!`);
          if (onDownloadCompleteRecord) {
            onDownloadCompleteRecord({
              title: task.title,
              artist: task.artist,
              album: task.album,
              artwork: task.artwork,
              youtubeId: task.youtubeId,
              type: 'single_mp3',
              fileName: task.fileName
            });
          }
        } else {
          // Download de ZIP (Álbum ou Músicas Avulsas Selecionadas)
          const tracksPayload = (task.tracks || []).map((t) => ({
            title: t.title,
            artist: t.artist || task.artist,
            youtubeId: t.youtubeId
          }));

          updateTask({ status: 'downloading', progress: 20 });

          // Simulador suave de progresso enquanto o backend empacota faixas em paralelo
          const progressInterval = setInterval(() => {
            setActiveDownloads((prev) =>
              prev.map((t) => {
                if (t.id === task.id && t.status === 'downloading' && t.progress < 90) {
                  return { ...t, progress: Math.min(90, t.progress + 7) };
                }
                return t;
              })
            );
          }, 1200);

          const response = await fetch('/api/zip/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folderName: task.folderName || task.title,
              tracks: tracksPayload
            })
          });

          clearInterval(progressInterval);

          if (!response.ok) {
            throw new Error(`Falha no servidor ao gerar ZIP (${response.status})`);
          }

          const blob = await response.blob();
          if (blob.size < 150000 || blob.type.includes('json') || blob.type.includes('html')) {
            throw new Error('Arquivo ZIP indisponível ou vazio.');
          }

          updateTask({ status: 'processing', progress: 95 });
          await saveFileToDestination(blob, task.fileName);
          updateTask({ status: 'completed', progress: 100, completedAt: Date.now() });

          if (showToast) showToast(`Pacote ZIP "${task.folderName || task.title}" pronto e salvo!`);
          if (onDownloadCompleteRecord) {
            onDownloadCompleteRecord({
              title: task.title,
              artist: task.artist,
              album: task.album,
              artwork: task.artwork,
              type: task.type,
              fileName: task.fileName
            });
          }
        }
      } catch (err: any) {
        console.error('Erro na tarefa de download:', err);
        updateTask({
          status: 'error',
          errorMsg: err.message || 'Erro inesperado durante o download'
        });
        if (showToast) {
          showToast(`Falha no download de ${task.title}. Você pode tentar novamente na fila.`);
        }
      }
    },
    [showToast, onDownloadCompleteRecord]
  );

  // Iniciar download de faixa avulsa
  const startSingleTrackDownload = useCallback(
    (track: {
      title: string;
      artist: string;
      youtubeId?: string;
      artwork?: string;
      album?: string;
    }) => {
      const cleanArtist = (track.artist || '').trim();
      const cleanTitle = (track.title || 'Faixa').trim();
      const safeFileName = `${cleanArtist ? `${cleanArtist} - ` : ''}${cleanTitle}`
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() + '.mp3';

      const newTask: BackgroundDownloadTask = {
        id: `single_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        artist: cleanArtist,
        album: track.album,
        artwork: track.artwork,
        youtubeId: track.youtubeId,
        type: 'single_mp3',
        fileName: safeFileName,
        progress: 0,
        status: 'queued',
        startedAt: Date.now()
      };

      setActiveDownloads((prev) => [newTask, ...prev]);
      if (showToast) {
        showToast(`Download de "${cleanTitle}" iniciado em segundo plano!`);
      }

      // Executa de forma assíncrona
      setTimeout(() => executeDownloadTask(newTask), 50);
    },
    [executeDownloadTask, showToast]
  );

  // Iniciar download de álbum completo em ZIP
  const startAlbumZipDownload = useCallback(
    (album: {
      title: string;
      artist: string;
      artwork?: string;
      tracks: Array<{ title: string; artist?: string; youtubeId?: string }>;
    }) => {
      const cleanArtist = (album.artist || '').trim();
      const cleanTitle = (album.title || 'Album').trim();
      const folderName = `${cleanArtist ? `${cleanArtist} - ` : ''}${cleanTitle}`
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
      const safeFileName = `${folderName}.zip`;

      const newTask: BackgroundDownloadTask = {
        id: `album_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        artist: cleanArtist,
        album: cleanTitle,
        artwork: album.artwork,
        type: 'album_zip',
        fileName: safeFileName,
        folderName,
        trackCount: album.tracks.length,
        tracks: album.tracks,
        progress: 0,
        status: 'queued',
        startedAt: Date.now()
      };

      setActiveDownloads((prev) => [newTask, ...prev]);
      if (showToast) {
        showToast(`Download do Álbum "${cleanTitle}" (${album.tracks.length} músicas) iniciado em segundo plano!`);
      }

      setTimeout(() => executeDownloadTask(newTask), 50);
    },
    [executeDownloadTask, showToast]
  );

  // Iniciar download em lote de músicas avulsas selecionadas em ZIP
  const startSinglesBatchDownload = useCallback(
    (
      folderName: string,
      tracks: Array<{ title: string; artist: string; youtubeId?: string; artwork?: string }>
    ) => {
      const cleanFolderName = (folderName || 'Musicas_Avulsas')
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
      const safeFileName = `${cleanFolderName}.zip`;

      const newTask: BackgroundDownloadTask = {
        id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: cleanFolderName,
        artist: tracks[0]?.artist || 'Vários Artistas',
        artwork: tracks[0]?.artwork,
        type: 'singles_zip',
        fileName: safeFileName,
        folderName: cleanFolderName,
        trackCount: tracks.length,
        tracks,
        progress: 0,
        status: 'queued',
        startedAt: Date.now()
      };

      setActiveDownloads((prev) => [newTask, ...prev]);
      if (showToast) {
        showToast(`Download em lote (${tracks.length} músicas) iniciado em segundo plano!`);
      }

      setTimeout(() => executeDownloadTask(newTask), 50);
    },
    [executeDownloadTask, showToast]
  );

  // Retomar ou tentar novamente
  const retryDownload = useCallback(
    (id: string) => {
      const task = activeDownloads.find((t) => t.id === id);
      if (task) {
        executeDownloadTask(task);
      }
    },
    [activeDownloads, executeDownloadTask]
  );

  // Cancelar download
  const cancelDownload = useCallback((id: string) => {
    setActiveDownloads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t))
    );
  }, []);

  // Limpar concluídos
  const clearCompleted = useCallback(() => {
    setActiveDownloads((prev) =>
      prev.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
    );
  }, []);

  const hasActiveDownloads = activeDownloads.some(
    (t) => t.status === 'downloading' || t.status === 'queued' || t.status === 'processing'
  );

  return (
    <DownloadManagerContext.Provider
      value={{
        activeDownloads,
        isDrawerOpen,
        setIsDrawerOpen,
        customFolderHandle,
        customFolderName,
        selectCustomFolder,
        clearCustomFolder,
        startSingleTrackDownload,
        startAlbumZipDownload,
        startSinglesBatchDownload,
        retryDownload,
        cancelDownload,
        clearCompleted,
        hasActiveDownloads,
        saveFileToDestination
      }}
    >
      {children}
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager() {
  const context = useContext(DownloadManagerContext);
  if (!context) {
    throw new Error('useDownloadManager must be used within a DownloadManagerProvider');
  }
  return context;
}
