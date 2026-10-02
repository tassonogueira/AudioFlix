/**
 * AudioFix - Aplicação Web SPA para Reparo, Renomeação e Conversão Inteligente de Áudio
 * 
 * Funciona em 4 Etapas Claras (Workflow em Etapas):
 * - Etapa 1: Carregar Músicas (Upload de arquivos, pastas do pendrive ou amostras de teste)
 * - Etapa 2: Escolher Modo (Apenas Renomear estilo Windows vs Conversão Real FFmpeg) & Formato/Regras
 * - Etapa 3: Revisar Comparativo ("Como Era ➔ Como Ficou" lado a lado com seleção, pré-escuta e edição inline)
 * - Etapa 4: Processamento & Download Final (ZIP completo com todas as músicas: convertidas + já no formato)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Music,
  FolderUp,
  Upload,
  Play,
  Pause,
  Download,
  Trash2,
  Archive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Code,
  FileAudio,
  FileCheck,
  Copy,
  Check,
  Info,
  X,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCheck,
  Zap,
  Tag,
  RefreshCw,
  SlidersHorizontal,
  Settings,
  Eye,
  Sliders,
  RotateCcw,
  CheckSquare,
  Square,
  Search,
  Youtube,
  Home,
  Menu,
  Heart,
  ListPlus
} from 'lucide-react';
import JSZip from 'jszip';
import YouTubeMusicDownloader from './components/YouTubeMusicDownloader.tsx';
import SplashScreen from './components/SplashScreen.tsx';
import InitialHubSelector from './components/InitialHubSelector.tsx';
import AudioFlixPlayer, { PlayerTrack } from './components/AudioFlixPlayer.tsx';
import DownloadFullTrackModal, { DownloadTrackInfo } from './components/DownloadFullTrackModal.tsx';
import AddToPlaylistModal from './components/AddToPlaylistModal.tsx';
import PlaylistsManagerView from './components/PlaylistsManagerView.tsx';
import DownloadsHistoryView from './components/DownloadsHistoryView.tsx';
import MobileQueueDrawer from './components/MobileQueueDrawer.tsx';
import OfflineBanner from './components/OfflineBanner.tsx';
import FloatingDownloadBadge from './components/FloatingDownloadBadge.tsx';
import DownloadQueueDrawer from './components/DownloadQueueDrawer.tsx';
import { DownloadManagerProvider, useDownloadManager } from './context/DownloadManagerContext.tsx';
import { PlaylistProvider, usePlaylistContext } from './context/PlaylistContext.tsx';
import { detectAudioFormat, AudioDetectionResult } from './utils/audioDetector.ts';
import { transcodeAudio, TargetFormat, BitrateOption } from './utils/audioTranscoder.ts';
import { generateTestSampleFiles } from './utils/testAudioGenerator.ts';
import {
  generateCleanTrackName,
  DEFAULT_RENAME_RULES,
  RenameRules
} from './utils/trackRenamer.ts';

export type WizardStep = 1 | 2 | 3 | 4;
export type OperationMode = 'rename_only' | 'full_transcode';

export interface QueueItem {
  id: string;
  file: File;
  relativePath?: string;
  detection: AudioDetectionResult;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  statusMessage: string;
  convertedBlob?: Blob;
  convertedUrl?: string;
  finalSize?: number;
  engineUsed?: 'ffmpeg' | 'webaudio' | 'stream_copy';
  errorDetails?: string;
  isPreservedWithoutReencode?: boolean;
}

export default function App() {
  return (
    <PlaylistProvider>
      <AudioFlixWithDownloadManager />
    </PlaylistProvider>
  );
}

function AudioFlixWithDownloadManager() {
  const { addDownloadRecord, showToast } = usePlaylistContext();

  return (
    <DownloadManagerProvider
      onDownloadCompleteRecord={addDownloadRecord}
      showToast={showToast}
    >
      <OfflineBanner />
      <AudioFlixMain />
      <FloatingDownloadBadge />
      <DownloadQueueDrawer />
    </DownloadManagerProvider>
  );
}

function AudioFlixMain() {
  // Playlist, Favoritas & Downloads Context
  const { modalTrack, closeAddToPlaylistModal, toastMessage, favorites, playlists, downloads } = usePlaylistContext();

  // Gerenciador de Downloads em Segundo Plano & Gaveta
  const { setIsDrawerOpen, hasActiveDownloads } = useDownloadManager();

  // Flash Screen / Splash de Inicialização
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Estado do Menu do Header
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // Modo Principal da Aplicação: 'hub' | 'downloader' | 'playlists' | 'downloads' | 'local_workflow'
  const [appMode, setAppMode] = useState<'hub' | 'downloader' | 'playlists' | 'downloads' | 'local_workflow'>('hub');
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>('');

  // Controle de rolagem para ocultar o Header ao rolar
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const lastScrollY = useRef<number>(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 70 && currentScrollY > lastScrollY.current + 8) {
        // Rolando para baixo: oculta o header
        setIsHeaderVisible(false);
      } else if (currentScrollY < lastScrollY.current - 8 || currentScrollY <= 40) {
        // Rolando para cima ou no topo: exibe o header
        setIsHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Player de Áudio Global para Músicas Completas (Sem cortes de 30s)
  const [activePlayerTrack, setActivePlayerTrack] = useState<PlayerTrack | null>(null);
  const [playerPlaylist, setPlayerPlaylist] = useState<PlayerTrack[]>([]);

  // Modal de Download de Faixa Completa
  const [downloadModalTrack, setDownloadModalTrack] = useState<DownloadTrackInfo | null>(null);

  // Controle de Etapa (1 a 4)
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Fila de arquivos
  const [queue, setQueue] = useState<QueueItem[]>([]);
  
  // Seleção de itens para download e lote (por padrão todos são selecionados)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modo de Operação: 'rename_only' (igual ao Windows F2) vs 'full_transcode' (conversão profunda de áudio)
  const [operationMode, setOperationMode] = useState<OperationMode>('rename_only');

  // Formato Padrão Escolhido pelo Usuário (Padrão: MP3)
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('mp3');
  const [bitrate, setBitrate] = useState<BitrateOption>(192);

  // Regras de renomeação configuráveis na Etapa 2
  const [rules, setRules] = useState<RenameRules>({
    ...DEFAULT_RENAME_RULES,
    targetFormat: 'mp3'
  });

  // Mapeamento de edições manuais feitas pelo usuário nos nomes
  const [customNamesMap, setCustomNamesMap] = useState<Record<string, string>>({});

  // Filtros na tabela da Etapa 3
  const [filterTab, setFilterTab] = useState<'all' | 'needs_conversion' | 'already_target' | 'completed'>('all');

  // Estados de processamento em lote
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [currentStageMessage, setCurrentStageMessage] = useState<string>('');
  const [currentStageProgress, setCurrentStageProgress] = useState<number>(0);
  
  // Opção para baixar ZIP automaticamente após concluir
  const [autoDownloadZipOnFinish, setAutoDownloadZipOnFinish] = useState<boolean>(false);

  // Estado de geração de ZIP e download
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [lastGeneratedZipUrl, setLastGeneratedZipUrl] = useState<string | null>(null);
  const [lastGeneratedZipName, setLastGeneratedZipName] = useState<string>('');
  const [zipSuccessToast, setZipSuccessToast] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Player de áudio embutido para pré-escuta ("Antes" ou "Depois")
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Referências para os inputs de arquivo
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => setPlayingAudioKey(null);
    audio.onerror = () => setPlayingAudioKey(null);
    audioPlayerRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Mantém targetFormat sincronizado com rules.targetFormat
  const handleTargetFormatChange = (newFormat: TargetFormat) => {
    setTargetFormat(newFormat);
    setRules(prev => ({ ...prev, targetFormat: newFormat }));
    resetCompletedStatus();
  };

  const handleOperationModeChange = (newMode: OperationMode) => {
    setOperationMode(newMode);
    resetCompletedStatus();
  };

  const resetCompletedStatus = () => {
    setQueue(prev => prev.map(item => ({
      ...item,
      status: 'pending',
      progress: 0,
      statusMessage: 'Aguardando processamento',
      convertedBlob: undefined,
      convertedUrl: undefined
    })));
  };

  const updateRule = <K extends keyof RenameRules>(key: K, value: RenameRules[K]) => {
    setRules(prev => ({ ...prev, [key]: value }));
  };

  // Determina o nome padronizado final garantido para uma faixa
  const getCleanTrackName = useCallback((item: QueueItem, index: number = 0): string => {
    if (customNamesMap[item.id]) {
      return customNamesMap[item.id];
    }
    const currentRules = {
      ...rules,
      targetFormat
    };
    const { newName } = generateCleanTrackName(item.file.name, item.detection, currentRules, index);
    return newName;
  }, [customNamesMap, rules, targetFormat]);

  // Verifica se o arquivo já tem o mesmo formato do padrão escolhido
  const checkIfAlreadyTargetFormat = useCallback((item: QueueItem, target: TargetFormat): boolean => {
    return item.detection.formatCode === target;
  }, []);

  // Adicionar arquivos à fila
  const addFilesToQueue = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;

    const newItems: QueueItem[] = [];

    for (const file of files) {
      const isDuplicate = queue.some(
        q => q.file.name === file.name && q.file.size === file.size
      );
      if (isDuplicate) continue;

      const id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const detection = await detectAudioFormat(file);
      const isTarget = detection.formatCode === targetFormat;

      let initialStatusMessage = '';
      if (operationMode === 'rename_only') {
        initialStatusMessage = `Pronto para renomear extensão para .${targetFormat.toUpperCase()} (Estilo Windows)`;
      } else if (isTarget) {
        initialStatusMessage = `Já é ${targetFormat.toUpperCase()} autêntico (Cópia direta sem perda)`;
      } else {
        initialStatusMessage = `Requer conversão (${detection.detectedFormat} ➔ ${targetFormat.toUpperCase()})`;
      }

      newItems.push({
        id,
        file,
        relativePath: (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name,
        detection,
        status: 'pending',
        progress: 0,
        statusMessage: initialStatusMessage,
        isPreservedWithoutReencode: isTarget
      });
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
      // Seleciona todos os novos itens por padrão
      setSelectedIds(prev => {
        const next = new Set(prev);
        newItems.forEach(i => next.add(i.id));
        return next;
      });
    }
  }, [queue, targetFormat, operationMode]);

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      await addFilesToQueue(filesArray);
    }
  };

  // Carregar amostras de teste (inclui faixas com extensões incorretas, M4A e tags)
  const handleLoadSamples = async () => {
    const sampleFiles = generateTestSampleFiles();
    await addFilesToQueue(sampleFiles);
  };

  // Tocar/pausar pré-escuta de áudio (tipo: 'before' = arquivo original, 'after' = arquivo pronto)
  const togglePlayAudio = (item: QueueItem, type: 'before' | 'after') => {
    if (!audioPlayerRef.current) return;

    const key = `${item.id}_${type}`;

    if (playingAudioKey === key) {
      audioPlayerRef.current.pause();
      setPlayingAudioKey(null);
    } else {
      let audioUrl = '';
      if (type === 'after') {
        audioUrl = item.convertedUrl || URL.createObjectURL(item.file);
      } else {
        audioUrl = URL.createObjectURL(item.file);
      }

      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.play().then(() => {
        setPlayingAudioKey(key);
      }).catch((err) => {
        console.warn('Erro na reprodução nativa:', err);
        setPlayingAudioKey(null);
      });
    }
  };

  // Remover item
  const removeItem = (id: string) => {
    if (isProcessingBatch) return;
    setQueue(prev => {
      const target = prev.find(i => i.id === id);
      if (target?.convertedUrl) {
        URL.revokeObjectURL(target.convertedUrl);
      }
      return prev.filter(i => i.id !== id);
    });
    setCustomNamesMap(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSelectedIds(prev => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  // Selecionar / Desmarcar item individual
  const toggleItemSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Selecionar / Desmarcar todos
  const toggleSelectAll = () => {
    if (selectedIds.size === queue.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.map(q => q.id)));
    }
  };

  // Limpar fila e resetar para etapa 1
  const clearQueueAndReset = () => {
    if (isProcessingBatch) return;
    queue.forEach(i => {
      if (i.convertedUrl) URL.revokeObjectURL(i.convertedUrl);
    });
    if (lastGeneratedZipUrl) {
      URL.revokeObjectURL(lastGeneratedZipUrl);
      setLastGeneratedZipUrl(null);
    }
    setQueue([]);
    setSelectedIds(new Set());
    setCustomNamesMap({});
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setPlayingAudioKey(null);
    setCurrentStep(1);
  };

  // Edição manual do nome inline na etapa 3
  const handleCustomNameChange = (id: string, newName: string) => {
    setCustomNamesMap(prev => ({ ...prev, [id]: newName }));
  };

  // Processar uma faixa individual (se o usuário quiser converter apenas músicas específicas)
  const processSingleTrack = async (itemId: string) => {
    const itemIndex = queue.findIndex(i => i.id === itemId);
    if (itemIndex === -1 || isProcessingBatch) return;

    const currentItem = queue[itemIndex];
    const cleanName = getCleanTrackName(currentItem, itemIndex);

    setQueue(prev => prev.map((item, idx) => 
      idx === itemIndex ? {
        ...item,
        status: 'processing',
        progress: 30,
        statusMessage: operationMode === 'rename_only' ? 'Renomeando...' : 'Convertendo...'
      } : item
    ));

    if (operationMode === 'rename_only') {
      const cleanBlob = new Blob([currentItem.file], {
        type: targetFormat === 'mp3' ? 'audio/mpeg' : `audio/${targetFormat}`
      });
      const url = URL.createObjectURL(cleanBlob);
      await new Promise(r => setTimeout(r, 40));

      setQueue(prev => prev.map((item, idx) => 
        idx === itemIndex ? {
          ...item,
          status: 'completed',
          progress: 100,
          statusMessage: `Renomeado para .${targetFormat.toUpperCase()} (Bytes intactos)`,
          convertedBlob: cleanBlob,
          convertedUrl: url,
          finalSize: cleanBlob.size,
          engineUsed: 'stream_copy',
          isPreservedWithoutReencode: true
        } : item
      ));
      return;
    }

    // Modo full_transcode
    const isAlreadyTarget = checkIfAlreadyTargetFormat(currentItem, targetFormat);
    if (isAlreadyTarget) {
      const cleanBlob = new Blob([currentItem.file], {
        type: targetFormat === 'mp3' ? 'audio/mpeg' : `audio/${targetFormat}`
      });
      const url = URL.createObjectURL(cleanBlob);
      await new Promise(r => setTimeout(r, 40));

      setQueue(prev => prev.map((item, idx) => 
        idx === itemIndex ? {
          ...item,
          status: 'completed',
          progress: 100,
          statusMessage: `Preservado direto em ${targetFormat.toUpperCase()}`,
          convertedBlob: cleanBlob,
          convertedUrl: url,
          finalSize: cleanBlob.size,
          engineUsed: 'stream_copy',
          isPreservedWithoutReencode: true
        } : item
      ));
      return;
    }

    try {
      const { blob, engineUsed } = await transcodeAudio(
        currentItem.file,
        targetFormat,
        bitrate,
        false,
        currentItem.detection.suggestedExt,
        (prog) => {
          const pct = prog.ratio ? Math.round(prog.ratio * 100) : 50;
          setQueue(prev => prev.map((item, idx) => 
            idx === itemIndex ? {
              ...item,
              progress: pct,
              statusMessage: prog.message || `Convertendo para ${targetFormat.toUpperCase()}...`
            } : item
          ));
        }
      );

      const convertedUrl = URL.createObjectURL(blob);
      setQueue(prev => prev.map((item, idx) => 
        idx === itemIndex ? {
          ...item,
          status: 'completed',
          progress: 100,
          statusMessage: `Convertido com sucesso para ${targetFormat.toUpperCase()}`,
          convertedBlob: blob,
          convertedUrl,
          finalSize: blob.size,
          engineUsed,
          isPreservedWithoutReencode: false
        } : item
      ));
    } catch (err) {
      setQueue(prev => prev.map((item, idx) => 
        idx === itemIndex ? {
          ...item,
          status: 'error',
          statusMessage: `Falha na conversão para ${targetFormat.toUpperCase()}`,
          errorDetails: err instanceof Error ? err.message : String(err)
        } : item
      ));
    }
  };

  // Executar processamento de todas as músicas na Etapa 4
  const startFullBatchProcessing = async (overrideMode?: OperationMode, autoDownloadAfter?: boolean) => {
    if (isProcessingBatch || queue.length === 0) return;

    const activeMode = overrideMode || operationMode;
    if (overrideMode && overrideMode !== operationMode) {
      setOperationMode(overrideMode);
    }

    setIsProcessingBatch(true);
    setCurrentStep(4);

    for (let i = 0; i < queue.length; i++) {
      const currentItem = queue[i];
      const cleanName = getCleanTrackName(currentItem, i);

      // Pular itens já concluídos no mesmo modo com blob válido
      if (currentItem.status === 'completed' && currentItem.convertedBlob) {
        continue;
      }

      setCurrentProcessingIndex(i);

      // =================================================================
      // MODO 1: APENAS RENOMEAR (Estilo Windows - Troca Direta de Extensão)
      // =================================================================
      if (activeMode === 'rename_only') {
        setCurrentStageMessage(`Renomeando e ajustando extensão: "${cleanName}"...`);
        setCurrentStageProgress(100);

        // Cria o blob preservando 100% dos bytes originais do arquivo com o MIME do formato escolhido
        const cleanBlob = new Blob([currentItem.file], {
          type: targetFormat === 'mp3' ? 'audio/mpeg' : `audio/${targetFormat}`
        });
        const url = URL.createObjectURL(cleanBlob);

        // Pausa sutil de 25ms para render suave de progresso na interface
        await new Promise(r => setTimeout(r, 25));

        setQueue(prev => prev.map((item, idx) => 
          idx === i ? {
            ...item,
            status: 'completed',
            progress: 100,
            statusMessage: `Renomeado para .${targetFormat.toUpperCase()} (Estilo Windows • Bytes intactos)`,
            convertedBlob: cleanBlob,
            convertedUrl: url,
            finalSize: cleanBlob.size,
            engineUsed: 'stream_copy',
            isPreservedWithoutReencode: true
          } : item
        ));
        continue;
      }

      // =================================================================
      // MODO 2: CONVERSÃO REAL DE ÁUDIO (Transcodificação FFmpeg)
      // =================================================================
      const isAlreadyTarget = checkIfAlreadyTargetFormat(currentItem, targetFormat);

      // CASO 2.1: O arquivo já é do formato padrão (ex: já é MP3 autêntico)
      if (isAlreadyTarget) {
        setCurrentStageMessage(`Preservando ${cleanName} (Stream Copy sem perda sonora)...`);
        setCurrentStageProgress(60);

        setQueue(prev => prev.map((item, idx) => 
          idx === i ? {
            ...item,
            status: 'processing',
            progress: 60,
            statusMessage: 'Preservando qualidade original (já é ' + targetFormat.toUpperCase() + ')...'
          } : item
        ));

        await new Promise(r => setTimeout(r, 35));

        const cleanBlob = new Blob([currentItem.file], {
          type: targetFormat === 'mp3' ? 'audio/mpeg' : `audio/${targetFormat}`
        });
        const url = URL.createObjectURL(cleanBlob);

        setQueue(prev => prev.map((item, idx) => 
          idx === i ? {
            ...item,
            status: 'completed',
            progress: 100,
            statusMessage: `Preservado direto em ${targetFormat.toUpperCase()}`,
            convertedBlob: cleanBlob,
            convertedUrl: url,
            finalSize: cleanBlob.size,
            engineUsed: 'stream_copy',
            isPreservedWithoutReencode: true
          } : item
        ));
        continue;
      }

      // CASO 2.2: O arquivo é M4A, WAV, FLAC, OGG, etc. e DEVE ser recodificado para o formato padrão (ex: MP3)!
      setCurrentStageMessage(`Convertendo ${currentItem.detection.detectedFormat} ➔ ${targetFormat.toUpperCase()}: "${cleanName}"`);
      setCurrentStageProgress(15);

      setQueue(prev => prev.map((item, idx) => 
        idx === i ? {
          ...item,
          status: 'processing',
          progress: 15,
          statusMessage: `Convertendo de ${currentItem.detection.detectedFormat} para ${targetFormat.toUpperCase()}...`
        } : item
      ));

      try {
        const { blob, engineUsed } = await transcodeAudio(
          currentItem.file,
          targetFormat,
          bitrate,
          false,
          currentItem.detection.suggestedExt,
          (prog) => {
            const pct = prog.ratio ? Math.round(prog.ratio * 100) : 50;
            setCurrentStageProgress(pct);
            if (prog.message) setCurrentStageMessage(prog.message);

            setQueue(prev => prev.map((item, idx) => 
              idx === i ? {
                ...item,
                progress: pct,
                statusMessage: prog.message || `Convertendo para ${targetFormat.toUpperCase()}...`
              } : item
            ));
          }
        );

        const convertedUrl = URL.createObjectURL(blob);

        setQueue(prev => prev.map((item, idx) => 
          idx === i ? {
            ...item,
            status: 'completed',
            progress: 100,
            statusMessage: `Convertido com sucesso para ${targetFormat.toUpperCase()}`,
            convertedBlob: blob,
            convertedUrl,
            finalSize: blob.size,
            engineUsed,
            isPreservedWithoutReencode: false
          } : item
        ));
      } catch (err) {
        console.error('Erro ao converter arquivo:', currentItem.file.name, err);
        setQueue(prev => prev.map((item, idx) => 
          idx === i ? {
            ...item,
            status: 'error',
            statusMessage: `Falha na conversão para ${targetFormat.toUpperCase()}`,
            errorDetails: err instanceof Error ? err.message : String(err)
          } : item
        ));
      }
    }

    setIsProcessingBatch(false);
    setCurrentProcessingIndex(-1);
    setCurrentStageMessage('');
    setCurrentStageProgress(0);

    // Se o usuário solicitou download automático ou se passou a flag
    if (autoDownloadAfter || autoDownloadZipOnFinish) {
      setTimeout(() => {
        downloadAllAsZip();
      }, 150);
    }
  };

  // Download do arquivo individual padronizado
  const downloadSingleFile = (item: QueueItem, index: number) => {
    const finalUrl = item.convertedUrl || URL.createObjectURL(item.file);
    const finalName = getCleanTrackName(item, index);

    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download do ZIP Completo (Garantindo que contém TODAS as músicas: as convertidas + as que já estavam no formato)
  const downloadAllAsZip = async () => {
    // Coleta as faixas selecionadas (ou todas se nada estiver marcado)
    const itemsToPackage = queue.filter(item => selectedIds.size === 0 || selectedIds.has(item.id));
    if (itemsToPackage.length === 0) {
      alert('Nenhuma música selecionada para gerar o ZIP.');
      return;
    }

    setIsZipping(true);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();

      for (let i = 0; i < itemsToPackage.length; i++) {
        const item = itemsToPackage[i];
        const globalIndex = queue.findIndex(q => q.id === item.id);
        let finalName = getCleanTrackName(item, globalIndex >= 0 ? globalIndex : i);

        // Deduplicação de nomes para impedir que faixas com o mesmo nome se sobrescrevam no ZIP
        const lowerName = finalName.toLowerCase();
        if (usedNames.has(lowerName)) {
          const count = (usedNames.get(lowerName) || 0) + 1;
          usedNames.set(lowerName, count);
          const lastDot = finalName.lastIndexOf('.');
          const base = lastDot > 0 ? finalName.substring(0, lastDot) : finalName;
          const ext = lastDot > 0 ? finalName.substring(lastDot) : '';
          finalName = `${base} (${count})${ext}`;
        } else {
          usedNames.set(lowerName, 0);
        }

        // Se o item foi convertido pelo FFmpeg, utiliza o blob convertido recodificado.
        // Se o item já estava no formato padrão ou foi renomeado, utiliza o blob limpo ou o arquivo original.
        // Ambos os casos têm 100% de integridade garantida!
        const blobToAdd = item.convertedBlob || item.file;
        zip.file(finalName, blobToAdd);
      }

      // Utiliza compressão 'STORE' (sem recompressão zlib desnecessária de arquivos de áudio já compactados).
      // Isso faz o arquivo ZIP ser gerado em menos de 500ms, sem travamento de tela e sem bloqueio do navegador!
      const content = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'STORE'
        },
        (metadata) => {
          setZipProgress(Math.round(metadata.percent));
        }
      );

      const zipUrl = URL.createObjectURL(content);
      const modeSuffix = operationMode === 'rename_only' ? 'renomeadas' : 'convertidas';
      const zipFileName = `musicas_completas_${modeSuffix}_${targetFormat.toUpperCase()}_(${itemsToPackage.length}_faixas).zip`;

      setLastGeneratedZipUrl(zipUrl);
      setLastGeneratedZipName(zipFileName);

      // Dispara o download com 1 clique direto no navegador
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setZipSuccessToast(`Pacote ZIP com todas as ${itemsToPackage.length} músicas gerado e baixado com sucesso!`);
      setTimeout(() => setZipSuccessToast(null), 7000);
    } catch (err) {
      console.error('Erro ao gerar arquivo ZIP:', err);
      alert(`Falha ao gerar arquivo ZIP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsZipping(false);
    }
  };

  // Estatísticas da fila
  const totalCount = queue.length;
  const selectedCount = selectedIds.size > 0 ? selectedIds.size : totalCount;

  const alreadyInTargetCount = useMemo(() => {
    return queue.filter(item => checkIfAlreadyTargetFormat(item, targetFormat)).length;
  }, [queue, targetFormat, checkIfAlreadyTargetFormat]);

  const needsConversionCount = useMemo(() => {
    return queue.filter(item => !checkIfAlreadyTargetFormat(item, targetFormat)).length;
  }, [queue, targetFormat, checkIfAlreadyTargetFormat]);

  const completedCount = queue.filter(i => i.status === 'completed').length;
  const convertedCount = queue.filter(i => i.status === 'completed' && !i.isPreservedWithoutReencode).length;
  const preservedCount = queue.filter(i => i.status === 'completed' && i.isPreservedWithoutReencode).length;

  // Tamanho total estimado
  const totalSizeBytes = useMemo(() => {
    return queue.reduce((acc, curr) => acc + (curr.finalSize || curr.file.size), 0);
  }, [queue]);

  // Progresso geral do lote
  const overallBatchPercent = useMemo(() => {
    if (totalCount === 0) return 0;
    return Math.round((completedCount / totalCount) * 100);
  }, [completedCount, totalCount]);

  // Filtragem dos itens exibidos na tabela da etapa 3
  const filteredQueue = useMemo(() => {
    if (filterTab === 'needs_conversion') {
      return queue.filter(item => !checkIfAlreadyTargetFormat(item, targetFormat));
    }
    if (filterTab === 'already_target') {
      return queue.filter(item => checkIfAlreadyTargetFormat(item, targetFormat));
    }
    if (filterTab === 'completed') {
      return queue.filter(item => item.status === 'completed');
    }
    return queue;
  }, [queue, filterTab, targetFormat, checkIfAlreadyTargetFormat]);

  // Lista dos passos do assistente
  const stepsConfig = [
    { number: 1 as WizardStep, label: 'Carregar Músicas', icon: Upload, description: 'Arquivos do pendrive' },
    { number: 2 as WizardStep, label: 'Modo & Formato', icon: Settings, description: 'Renomear ou Converter' },
    { number: 3 as WizardStep, label: 'Como Era ➔ Como Ficou', icon: Eye, description: 'Comparativo antes e depois' },
    { number: 4 as WizardStep, label: 'Processar & Baixar ZIP', icon: Archive, description: 'Download com todas faixas' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* 1. TOP BAR - O HEADER SOME AO ROLAR */}
      <header
        className={`border-b border-slate-800 bg-slate-950 sticky top-0 z-40 transition-transform duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div
            onClick={() => setAppMode('hub')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/40 group-hover:scale-105 transition">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
            <div>
              <span className="text-lg font-black text-white tracking-tight leading-none block">
                Audio<span className="text-emerald-400">Flix</span>
              </span>
            </div>
          </div>

          {/* SELETOR DE MODO NO HEADER (DESKTOP) */}
          <div className="hidden md:flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setAppMode('hub')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                appMode === 'hub'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5 text-slate-300" />
              <span>Início</span>
            </button>

            <button
              onClick={() => setAppMode('downloader')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                appMode === 'downloader'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-emerald-300" />
              <span>Buscar Álbuns & Músicas</span>
            </button>

            <button
              onClick={() => setAppMode('playlists')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                appMode === 'playlists'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${appMode === 'playlists' ? 'fill-current text-white' : 'text-rose-400'}`} />
              <span>Favoritas & Playlists</span>
              {favorites.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-rose-300 font-bold font-mono">
                  {favorites.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setAppMode('downloads')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                appMode === 'downloads'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Meus Downloads</span>
              {downloads.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-emerald-300 font-bold font-mono">
                  {downloads.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setAppMode('local_workflow')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                appMode === 'local_workflow'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Reparar Pendrive</span>
              {totalCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-emerald-400 font-bold">
                  {totalCount}
                </span>
              )}
            </button>
          </div>

          {/* AÇÕES E BOTÃO DE MENU */}
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <button
                onClick={downloadAllAsZip}
                disabled={isZipping}
                title="Gera e baixa o ZIP com todas as músicas"
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                <span>ZIP ({selectedCount})</span>
              </button>
            )}

            {/* Botão de Fila de Downloads em 2º Plano */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-emerald-500/50 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-sm relative"
              title="Abrir Fila de Downloads e Pasta de Destino"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Fila</span>
              {hasActiveDownloads && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-emerald-500/50 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-sm"
              title="Abrir Menu de Navegação"
            >
              <Menu className="w-4 h-4 text-emerald-400" />
              <span>Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* DRAWER / MODAL DO MENU COM FUNDO 100% OPACO SÓLIDO */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="w-72 sm:w-80 h-full bg-slate-950 border-l border-slate-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 z-[101]"
            style={{ backgroundColor: '#0b0f19' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <span className="text-lg font-black text-white tracking-tight">
                    Audio<span className="text-emerald-400">Flix</span>
                  </span>
                </div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Itens do Menu */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setAppMode('hub');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                    appMode === 'hub'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850'
                  }`}
                >
                  <Home className="w-4 h-4 text-emerald-300" />
                  <div>
                    <span className="block font-bold">Início</span>
                    <span className="text-[10px] text-slate-400 font-normal">Hub de escolha</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setAppMode('downloader');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                    appMode === 'downloader'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850'
                  }`}
                >
                  <Search className="w-4 h-4 text-emerald-300" />
                  <div>
                    <span className="block font-bold">Buscar Álbuns e Músicas</span>
                    <span className="text-[10px] text-slate-400 font-normal">Discografias e player completo</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setAppMode('playlists');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                    appMode === 'playlists'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850'
                  }`}
                >
                  <Heart className="w-4 h-4 text-rose-400 fill-rose-500/30" />
                  <div className="flex-1">
                    <span className="block font-bold">Minhas Playlists & Favoritas</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {favorites.length} favoritas • {playlists.length} playlists
                    </span>
                  </div>
                  {favorites.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 font-mono font-bold">
                      {favorites.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setAppMode('downloads');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                    appMode === 'downloads'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850'
                  }`}
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <div className="flex-1">
                    <span className="block font-bold">Meus Downloads</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {downloads.length} arquivos salvos no dispositivo
                    </span>
                  </div>
                  {downloads.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      {downloads.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsDrawerOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850"
                >
                  <Download className="w-4 h-4 text-teal-400" />
                  <div className="flex-1">
                    <span className="block font-bold">Fila de Downloads & Pasta</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Progresso em tempo real e escolha da pasta de destino
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setAppMode('local_workflow');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full p-3 rounded-xl text-left text-xs font-bold transition flex items-center gap-3 cursor-pointer ${
                    appMode === 'local_workflow'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-900 bg-slate-900/60 border border-slate-850'
                  }`}
                >
                  <FolderUp className="w-4 h-4 text-amber-400" />
                  <div className="flex-1">
                    <span className="block font-bold">Reparar Pendrive</span>
                    <span className="text-[10px] text-slate-400 font-normal">Fluxo em 4 etapas</span>
                  </div>
                  {totalCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      {totalCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Rodapé do Menu */}
            <div className="pt-4 border-t border-slate-800/80 text-center">
              <span className="text-[11px] text-slate-500">
                AudioFlix • <strong className="text-emerald-400">by Tasso</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLUTUANTE DE SUCESSO DO ZIP */}
      {zipSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/40">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">{zipSuccessToast}</span>
            <button
              onClick={() => setZipSuccessToast(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. BARRA DE INDICADOR DE ETAPAS (WIZARD STEPPER - Apenas no modo local) */}
      {appMode === 'local_workflow' && (
        <section className="bg-slate-900/80 border-b border-slate-800 py-3 sm:py-4 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3 sm:hidden">
              <button
                onClick={() => setAppMode('downloader')}
                className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar ao Buscador do YouTube</span>
              </button>
            </div>

            <div className="flex items-center justify-between relative">
              {/* Linha de conexão entre os círculos */}
              <div className="absolute top-1/2 left-6 right-6 -translate-y-1/2 h-0.5 bg-slate-800 -z-0">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{
                    width: `${((currentStep - 1) / (stepsConfig.length - 1)) * 100}%`
                  }}
                />
              </div>

              {/* Os 4 botões de etapas */}
              {stepsConfig.map((s) => {
                const isPassed = currentStep > s.number;
                const isCurrent = currentStep === s.number;
                const isClickable = s.number <= currentStep || (totalCount > 0);

                return (
                  <button
                    key={s.number}
                    disabled={!isClickable || isProcessingBatch}
                    onClick={() => setCurrentStep(s.number)}
                    className={`flex flex-col items-center group relative z-10 focus:outline-none transition ${
                      isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all border-2 ${
                        isPassed
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                          : isCurrent
                          ? 'bg-slate-900 border-emerald-400 text-emerald-400 ring-4 ring-emerald-500/20 scale-105 shadow-lg'
                          : 'bg-slate-900 border-slate-700 text-slate-500'
                      }`}
                    >
                      {isPassed ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white stroke-[2.5]" /> : s.number}
                    </div>

                    <span
                      className={`text-[11px] sm:text-xs font-semibold mt-1.5 transition text-center max-w-[80px] sm:max-w-[120px] ${
                        isCurrent ? 'text-emerald-400' : isPassed ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {s.label}
                    </span>
                    
                    <span className="text-[10px] text-slate-500 hidden md:block">
                      {s.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 3. CONTEÚDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">

        {appMode === 'hub' ? (
          <InitialHubSelector
            onSelectSearch={(query) => {
              if (query) setInitialSearchQuery(query);
              setAppMode('downloader');
            }}
            onSelectRepair={() => setAppMode('local_workflow')}
            onSelectPlaylists={() => setAppMode('playlists')}
            onSelectDownloads={() => setAppMode('downloads')}
            onLoadSamples={handleLoadSamples}
          />
        ) : appMode === 'downloader' ? (
          <YouTubeMusicDownloader
            onSwitchToLocalWorkflow={() => setAppMode('local_workflow')}
            onPlayFullTrack={(track, list) => {
              setActivePlayerTrack(track);
              if (list) setPlayerPlaylist(list);
            }}
            activePlayingTrackId={activePlayerTrack?.id}
            isPlayingFullTrack={true}
            onOpenDownloadModal={(track) => setDownloadModalTrack(track)}
            initialSearchQuery={initialSearchQuery}
          />
        ) : appMode === 'downloads' ? (
          <DownloadsHistoryView
            onPlayTrack={(track) => setActivePlayerTrack(track)}
            onExploreSongs={() => setAppMode('downloader')}
          />
        ) : appMode === 'playlists' ? (
          <PlaylistsManagerView
            onPlayTrack={(track, list) => {
              setActivePlayerTrack({
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                artwork: track.artwork,
                durationSeconds: track.durationSeconds,
                youtubeId: track.youtubeId,
                previewUrl: track.previewUrl
              });
              if (list) {
                setPlayerPlaylist(
                  list.map((item: any) => ({
                    id: item.id,
                    title: item.title,
                    artist: item.artist,
                    album: item.album,
                    artwork: item.artwork,
                    durationSeconds: item.durationSeconds,
                    youtubeId: item.youtubeId,
                    previewUrl: item.previewUrl
                  }))
                );
              }
            }}
            onExploreSongs={() => setAppMode('downloader')}
          />
        ) : (
          <>
            {/* ========================================================= */}
            {/* ETAPA 1: CARREGAR MÚSICAS */}
            {/* ========================================================= */}
            {currentStep === 1 && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <span>Etapa 1 de 4</span>
                <span className="text-slate-600">·</span>
                <span>Importação dos Arquivos</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Carregue as músicas do seu pendrive
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Arraste arquivos individuais ou pastas inteiras. Pode colocar arquivos com extensões incorretas (<code className="text-slate-300">.txt</code>, <code className="text-slate-300">.unknown</code>, <code className="text-slate-300">.dat</code>), arquivos <code className="text-slate-300">.m4a</code> ou músicas normais. O app lê os bytes reais de cada arquivo.
              </p>
            </div>

            {/* SELETOR RÁPIDO DO MODO DE OPERAÇÃO NA ETAPA 1 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Modo de Operação Pré-Selecionado:
                </span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Você também pode ajustar na Etapa 2
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOperationModeChange('rename_only')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    operationMode === 'rename_only'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 fill-emerald-400/20" />
                      ⚡ Apenas Renomear (Estilo Windows)
                    </span>
                    {operationMode === 'rename_only' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500 text-slate-950 font-bold">Ativo</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    Troca a extensão (ex: <code className="text-slate-200">.m4a ➔ .mp3</code>) e limpa o nome <strong>sem recodificar o áudio</strong>. É instantâneo (0s de espera) e preserva 100% da integridade sonora original.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleOperationModeChange('full_transcode')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    operationMode === 'full_transcode'
                      ? 'bg-amber-500/15 border-amber-500 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-amber-400 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4" />
                      🔄 Conversão Real de Áudio (FFmpeg)
                    </span>
                    {operationMode === 'full_transcode' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500 text-slate-950 font-bold">Ativo</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    Recodifica o fluxo de áudio para MP3 autêntico com a taxa de bits selecionada. Necessário caso o som antigo do seu carro não toque arquivos AAC renomeados para .mp3.
                  </p>
                </button>
              </div>
            </div>

            {/* Zona de Drag & Drop */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[0.995]'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files) addFilesToQueue(Array.from(e.target.files));
                  e.target.value = '';
                }}
                multiple
                className="hidden"
              />
              <input
                type="file"
                ref={folderInputRef}
                // @ts-ignore
                webkitdirectory="true"
                // @ts-ignore
                directory="true"
                multiple
                onChange={(e) => {
                  if (e.target.files) addFilesToQueue(Array.from(e.target.files));
                  e.target.value = '';
                }}
                className="hidden"
              />

              <div className="max-w-md mx-auto flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7" />
                </div>

                <h3 className="text-base font-semibold text-white mb-1">
                  Arraste suas músicas ou a pasta aqui
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Suporta seleção múltipla e importação de diretórios inteiros do pendrive
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
                  >
                    <FileAudio className="w-4 h-4" />
                    Selecionar Arquivos
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      folderInputRef.current?.click();
                    }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-2"
                  >
                    <FolderUp className="w-4 h-4 text-amber-400" />
                    Selecionar Pasta do Pendrive
                  </button>
                </div>
              </div>
            </div>

            {/* Resumo da Fila Carregada */}
            {totalCount > 0 ? (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      {totalCount}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {totalCount} {totalCount === 1 ? 'música carregada' : 'músicas carregadas com sucesso'}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {operationMode === 'rename_only'
                          ? `Modo "Apenas Renomear" ativo: 0s de espera, troca de extensão direta para .${targetFormat.toUpperCase()}`
                          : needsConversionCount > 0
                          ? `${needsConversionCount} precisarão de conversão (${targetFormat.toUpperCase()}) • ${alreadyInTargetCount} já são compatíveis`
                          : `Todas as faixas já estão no formato desejado`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearQueueAndReset}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-300 text-xs transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar</span>
                    </button>

                    {/* Botão de 1-Clique para Apenas Renomear se for o modo desejado */}
                    {operationMode === 'rename_only' && (
                      <button
                        onClick={() => startFullBatchProcessing('rename_only')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition flex items-center gap-1.5"
                        title="Troca as extensões e limpa os nomes instantaneamente sem passar pelas etapas intermediárias"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Renomear Agora (1 Clique)</span>
                      </button>
                    )}

                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                    >
                      <span>Avançar para Etapa 2</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Prévia dos primeiros itens */}
                <div className="border border-slate-800/80 rounded-xl overflow-hidden divide-y divide-slate-800/60 text-xs">
                  {queue.slice(0, 5).map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between gap-3 bg-slate-950/40">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileAudio className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-mono text-slate-200 truncate">{item.file.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.detection.formatCode === 'm4a'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {item.detection.detectedFormat}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">{formatBytes(item.file.size)}</span>
                      </div>
                    </div>
                  ))}
                  {totalCount > 5 && (
                    <div className="p-2.5 text-center text-slate-500 text-[11px] bg-slate-950/60 font-mono">
                      + mais {totalCount - 5} arquivos carregados na fila
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <button
                  onClick={handleLoadSamples}
                  className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-4 inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Não tem arquivos agora? Clique aqui para carregar faixas de teste (.m4a, .txt, etc.)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* ETAPA 2: ESCOLHER MODO, FORMATO PADRÃO & REGRAS */}
        {/* ========================================================= */}
        {currentStep === 2 && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <span>Etapa 2 de 4</span>
                <span className="text-slate-600">·</span>
                <span>Configuração de Modo & Regras</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Defina como deseja processar suas músicas
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Escolha se deseja apenas trocar a extensão e limpar os nomes (igual ao Windows, 100% instantâneo) ou realizar a conversão real de áudio via FFmpeg.
              </p>
            </div>

            {/* 1. SELEÇÃO DO MODO DE OPERAÇÃO */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                1. Escolha o Modo de Processamento:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Opção A: Apenas Renomear (Estilo Windows) */}
                <div
                  onClick={() => handleOperationModeChange('rename_only')}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                    operationMode === 'rename_only'
                      ? 'bg-emerald-500/15 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                        <Zap className="w-4 h-4 fill-emerald-400/20" />
                        ⚡ Apenas Renomear (Estilo Windows)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Instantâneo • 0s
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      Troca a extensão de arquivos (ex: <code className="text-slate-200">.m4a</code> ➔ <code className="text-emerald-400">.{targetFormat}</code>, <code className="text-slate-200">.txt</code> ➔ <code className="text-emerald-400">.{targetFormat}</code>) e limpa o nome das músicas <strong>sem re-codificar o áudio</strong>.
                    </p>

                    <ul className="text-[11px] text-slate-400 space-y-1 font-mono">
                      <li className="flex items-center gap-1.5 text-emerald-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Zero perda sonora (100% bytes originais preservados)
                      </li>
                      <li className="flex items-center gap-1.5 text-emerald-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Processa dezenas de músicas em menos de 1 segundo
                      </li>
                      <li className="flex items-center gap-1.5 text-slate-400">
                        <Info className="w-3.5 h-3.5 text-slate-500" />
                        Igual a apertar F2 e mudar a extensão no Windows
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500">Recomendado para velocidade</span>
                    {operationMode === 'rename_only' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Selecionado
                      </span>
                    ) : (
                      <span className="text-slate-500">Clique para selecionar</span>
                    )}
                  </div>
                </div>

                {/* Opção B: Conversão Real FFmpeg */}
                <div
                  onClick={() => handleOperationModeChange('full_transcode')}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                    operationMode === 'full_transcode'
                      ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/20 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-amber-400 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        🔄 Conversão Real de Áudio (FFmpeg)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Transcodificação
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      Decodifica o arquivo e recodifica novos fluxos MP3 oficiais com a taxa de bits selecionada. Transforma áudio AAC/M4A em quadros MP3 reais.
                    </p>

                    <ul className="text-[11px] text-slate-400 space-y-1 font-mono">
                      <li className="flex items-center gap-1.5 text-amber-300">
                        <Check className="w-3.5 h-3.5 text-amber-400" />
                        Garante compatibilidade com centrais automotivas antigas
                      </li>
                      <li className="flex items-center gap-1.5 text-amber-300">
                        <Check className="w-3.5 h-3.5 text-amber-400" />
                        Transcodifica qualquer container para formato padrão
                      </li>
                      <li className="flex items-center gap-1.5 text-slate-400">
                        <Info className="w-3.5 h-3.5 text-slate-500" />
                        Executa no navegador com WebAssembly e feedback de progresso
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500">Para rádios de som rígidos</span>
                    {operationMode === 'full_transcode' ? (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Selecionado
                      </span>
                    ) : (
                      <span className="text-slate-500">Clique para selecionar</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* 2. SELEÇÃO DO FORMATO PADRÃO */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                2. Formato Padrão Desejado:
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { fmt: 'mp3' as TargetFormat, title: 'MP3', desc: 'Universal • Pendrive & Carros' },
                  { fmt: 'wav' as TargetFormat, title: 'WAV', desc: 'Áudio Sem Compressão' },
                  { fmt: 'flac' as TargetFormat, title: 'FLAC', desc: 'Lossless Sem Perdas' },
                  { fmt: 'm4a' as TargetFormat, title: 'M4A', desc: 'Padrão Apple AAC' },
                  { fmt: 'ogg' as TargetFormat, title: 'OGG', desc: 'Vorbis / Aberto' },
                ].map((item) => (
                  <button
                    key={item.fmt}
                    onClick={() => handleTargetFormatChange(item.fmt)}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      targetFormat === item.fmt
                        ? 'bg-emerald-600/15 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-sm font-bold">{item.title}</span>
                        {targetFormat === item.fmt && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 leading-tight block">
                        {item.desc}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Bitrate se for Conversão Real em MP3 ou M4A */}
              {operationMode === 'full_transcode' && (targetFormat === 'mp3' || targetFormat === 'm4a') && (
                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-200 block">Qualidade de Saída (Taxa de Bits):</span>
                    <span className="text-slate-400 text-[11px]">192 kbps é a taxa recomendada para pendrives automotivos.</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                    {[
                      { val: 128 as BitrateOption, label: '128 kbps (Econômico)' },
                      { val: 192 as BitrateOption, label: '192 kbps (Recomendado)' },
                      { val: 320 as BitrateOption, label: '320 kbps (Alta Fidelidade)' },
                    ].map((b) => (
                      <button
                        key={b.val}
                        onClick={() => setBitrate(b.val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                          bitrate === b.val
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. REGRAS DE LIMPEZA DE NOMES */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  3. Regras de Limpeza Automática dos Títulos
                </span>
                <span className="text-[11px] text-slate-500">
                  Visualizável lado a lado na próxima etapa
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                
                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={rules.fixExtension}
                    onChange={(e) => updateRule('fixExtension', e.target.checked)}
                    className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Padronizar Extensão para .{targetFormat}</div>
                    <div className="text-[11px] text-slate-400">Corrige .txt, .unknown, .m4a e outros para .{targetFormat}</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={rules.removeVideoTags}
                    onChange={(e) => updateRule('removeVideoTags', e.target.checked)}
                    className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Remover Tags do YouTube</div>
                    <div className="text-[11px] text-slate-400">Remove [Official Video], (Clipe Oficial), (Lyrics) HD, 4K</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={rules.cleanSpacesAndUnderscores}
                    onChange={(e) => updateRule('cleanSpacesAndUnderscores', e.target.checked)}
                    className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Limpar Espaços & Underscores</div>
                    <div className="text-[11px] text-slate-400">Remove duplos espaços e converte "_" para espaços normais</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={rules.removeTrackNumbers}
                    onChange={(e) => updateRule('removeTrackNumbers', e.target.checked)}
                    className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Remover Numeração Inicial</div>
                    <div className="text-[11px] text-slate-400">Remove prefixos como "01 - ", "02. ", "track_01_"</div>
                  </div>
                </label>
              </div>
            </div>

            {/* BARRA DE NAVEGAÇÃO DA ETAPA 2 */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para Carregar Músicas</span>
              </button>

              <button
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 transition flex items-center gap-2"
              >
                <span>Avançar para Revisar Comparativo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ETAPA 3: COMPARATIVO "COMO ERA ➔ COMO FICOU" */}
        {/* ========================================================= */}
        {currentStep === 3 && (
          <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <span>Etapa 3 de 4</span>
                <span className="text-slate-600">·</span>
                <span>Revisão do Comparativo Antes ➔ Depois</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Veja exatamente como cada música era e como vai ficar
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Você pode pré-escutar o áudio original antes de processar, selecionar quais músicas quer incluir no ZIP, ou até editar manualmente qualquer nome diretamente na tabela.
              </p>
            </div>

            {/* Painel de Diagnóstico Resumido & Modo Ativo */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-300">
                  Total: <strong className="text-white">{totalCount}</strong> faixas
                </span>
                <span className="h-3 w-px bg-slate-700"></span>

                {operationMode === 'rename_only' ? (
                  <span className="text-emerald-400 font-sans flex items-center gap-1.5 font-bold">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    Modo: Apenas Renomear (Estilo Windows • 0s • Sem recodificar)
                  </span>
                ) : (
                  <>
                    <span className="text-amber-400 font-sans">
                      🔄 <strong className="text-amber-300">{needsConversionCount}</strong> converter para {targetFormat.toUpperCase()}
                    </span>
                    <span className="h-3 w-px bg-slate-700"></span>
                    <span className="text-emerald-400 font-sans">
                      ⚡ <strong className="text-emerald-300">{alreadyInTargetCount}</strong> já em {targetFormat.toUpperCase()} (Preservadas)
                    </span>
                  </>
                )}

                <span className="h-3 w-px bg-slate-700"></span>
                <span className="text-slate-400 font-sans">
                  Marcadas para o ZIP: <strong className="text-emerald-300">{selectedCount}</strong> de {totalCount}
                </span>
              </div>

              {/* Filtros da tabela */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    filterTab === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Todas ({totalCount})
                </button>
                {operationMode === 'full_transcode' && (
                  <>
                    <button
                      onClick={() => setFilterTab('needs_conversion')}
                      className={`px-2.5 py-1 rounded text-xs transition ${
                        filterTab === 'needs_conversion' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Converter ({needsConversionCount})
                    </button>
                    <button
                      onClick={() => setFilterTab('already_target')}
                      className={`px-2.5 py-1 rounded text-xs transition ${
                        filterTab === 'already_target' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Já em {targetFormat.toUpperCase()} ({alreadyInTargetCount})
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* TABELA COMPARATIVA LADO A LADO COM CHECKBOX DE SELEÇÃO */}
            <div className="overflow-hidden border border-slate-800/80 rounded-2xl bg-slate-900/40 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800 tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          title={selectedIds.size === queue.length ? 'Desmarcar todas' : 'Selecionar todas'}
                          className="text-slate-400 hover:text-emerald-400 transition"
                        >
                          {selectedIds.size === queue.length && queue.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4 w-[45%]">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <FileAudio className="w-3.5 h-3.5 text-slate-400" />
                          Como Era (Original no Pendrive)
                        </span>
                      </th>
                      <th className="py-3 px-2 w-8 text-center text-slate-600">➔</th>
                      <th className="py-3 px-4 w-[45%]">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Como Vai Ficar (Formato: {targetFormat.toUpperCase()})
                        </span>
                      </th>
                      <th className="py-3 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredQueue.map((item, index) => {
                      const isAlreadyTarget = checkIfAlreadyTargetFormat(item, targetFormat);
                      const cleanName = getCleanTrackName(item, index);
                      const isPlayingBefore = playingAudioKey === `${item.id}_before`;
                      const isSelected = selectedIds.size === 0 || selectedIds.has(item.id);

                      return (
                        <tr key={item.id} className={`transition ${isSelected ? 'hover:bg-slate-800/30' : 'opacity-50 bg-slate-950/20'}`}>
                          
                          {/* CHECKBOX */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(item.id)}
                              className="rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700 cursor-pointer"
                              title="Marcar para incluir no arquivo ZIP final"
                            />
                          </td>

                          {/* COMO ERA */}
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2.5">
                              <button
                                onClick={() => togglePlayAudio(item, 'before')}
                                title={isPlayingBefore ? 'Pausar original' : 'Pré-escutar arquivo original'}
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition shrink-0 mt-0.5 ${
                                  isPlayingBefore
                                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                {isPlayingBefore ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                              </button>

                              <div className="flex flex-col min-w-0">
                                <span className="font-mono text-slate-300 truncate max-w-xs font-medium" title={item.file.name}>
                                  {item.file.name}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  <span className={`px-1.5 py-0.2 rounded font-semibold ${
                                    item.detection.formatCode === 'm4a'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}>
                                    {item.detection.detectedFormat}
                                  </span>
                                  <span>{formatBytes(item.file.size)}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* SETA */}
                          <td className="py-3 px-2 text-center text-slate-600">
                            <ArrowRight className="w-4 h-4 mx-auto text-emerald-400" />
                          </td>

                          {/* COMO VAI FICAR (EDITÁVEL) */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={cleanName}
                                onChange={(e) => handleCustomNameChange(item.id, e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded px-2.5 py-1 text-xs text-emerald-300 font-mono focus:outline-none"
                                title="Você pode editar este nome diretamente se desejar"
                              />

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                                  .{targetFormat}
                                </span>

                                {operationMode === 'rename_only' ? (
                                  <span className="text-[10px] text-emerald-400/90 font-sans flex items-center gap-1 font-medium">
                                    <Zap className="w-2.5 h-2.5 fill-current" />
                                    ⚡ Apenas Renomear (Estilo Windows • Sem perda sonora)
                                  </span>
                                ) : isAlreadyTarget ? (
                                  <span className="text-[10px] text-emerald-400/90 font-sans flex items-center gap-1">
                                    <Zap className="w-2.5 h-2.5" />
                                    Preservado direto (sem perda)
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-300 font-sans flex items-center gap-1">
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    Será convertido de {item.detection.detectedFormat}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* BOTÃO DE AÇÃO INDIVIDUAL (PROCESSAR ESSA FAIXA) */}
                          <td className="py-3 px-3 text-right">
                            {item.status === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-sans font-medium">
                                <Check className="w-3.5 h-3.5" />
                                Pronto
                              </span>
                            ) : item.status === 'processing' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400 inline" />
                            ) : (
                              <button
                                onClick={() => processSingleTrack(item.id)}
                                title="Processar apenas esta música agora"
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-sans transition"
                              >
                                {operationMode === 'rename_only' ? 'Renomear' : 'Converter'}
                              </button>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* OPÇÃO DE AUTO-DOWNLOAD E BARRA DE NAVEGAÇÃO DA ETAPA 3 */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={autoDownloadZipOnFinish}
                  onChange={(e) => setAutoDownloadZipOnFinish(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700"
                />
                <span>Baixar o arquivo ZIP automaticamente assim que o processamento terminar</span>
              </label>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  onClick={() => startFullBatchProcessing()}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-xl shadow-emerald-950/50 transition flex items-center gap-2"
                >
                  {operationMode === 'rename_only' ? (
                    <>
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                      <span>Renomear Todas & Baixar ZIP ➔</span>
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Converter & Baixar ZIP Completo ➔</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ETAPA 4: PROCESSAMENTO & DOWNLOAD DOS ARQUIVOS PRONTOS */}
        {/* ========================================================= */}
        {currentStep === 4 && (
          <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">
            
            {/* Se estiver processando: CARD DE PROGRESSO */}
            {isProcessingBatch ? (
              <div className="bg-amber-950/20 border-2 border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin shrink-0" />
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {operationMode === 'rename_only' ? 'Renomeando faixas' : 'Processando músicas para ' + targetFormat.toUpperCase()} ({completedCount + 1}/{totalCount})
                      </h3>
                      <p className="text-xs text-amber-300 font-mono mt-0.5">
                        {currentStageMessage || 'Processando arquivos...'}
                      </p>
                    </div>
                  </div>

                  <span className="text-2xl font-bold text-amber-400 font-mono">
                    {overallBatchPercent}%
                  </span>
                </div>

                <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-200 rounded-full"
                    style={{ width: `${overallBatchPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              /* CARD PRINCIPAL DE DOWNLOAD DO PACOTE ZIP COMPLETO */
              <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900/90 to-emerald-950/20 border-2 border-emerald-500/50 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-lg">
                      <Archive className="w-8 h-8 text-emerald-400" />
                    </div>

                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Pronto para Download
                      </div>

                      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        Baixar Pacote ZIP Completo com Todas as Músicas
                      </h3>

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                        {operationMode === 'rename_only' ? (
                          <>
                            O arquivo ZIP conterá todas as <strong>{selectedCount} faixas</strong> renomeadas para <code className="text-emerald-300">.{targetFormat.toUpperCase()}</code> com 100% dos bytes de áudio originais preservados sem perda de qualidade.
                          </>
                        ) : (
                          <>
                            O arquivo ZIP reunirá <strong>todas as {selectedCount} músicas</strong>: tanto as {convertedCount} convertidas com FFmpeg quanto as {preservedCount} que já estavam no formato original <code className="text-emerald-300">.{targetFormat.toUpperCase()}</code>.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* BOTÃO PRINCIPAL DE DOWNLOAD COM 1 CLIQUE */}
                  <div className="flex flex-col items-stretch lg:items-end gap-2 shrink-0">
                    <button
                      onClick={downloadAllAsZip}
                      disabled={isZipping || totalCount === 0}
                      className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-base font-bold shadow-xl shadow-emerald-950/60 transition flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
                    >
                      {isZipping ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>Empacotando ZIP ({zipProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-6 h-6" />
                          <span>Baixar ZIP ({selectedCount} músicas)</span>
                        </>
                      )}
                    </button>

                    <span className="text-[11px] text-slate-400 text-center lg:text-right">
                      Tamanho aproximado do pacote: <strong>{formatBytes(totalSizeBytes)}</strong>
                    </span>
                  </div>
                </div>

                {/* RESUMO DOS ARQUIVOS PRESENTES NO ZIP */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800/80 text-xs">
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      {selectedCount}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">Músicas no Pacote ZIP</div>
                      <div className="text-[11px] text-slate-400">100% reunidas em 1 pasta</div>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                      {operationMode === 'rename_only' ? selectedCount : convertedCount}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">
                        {operationMode === 'rename_only' ? 'Renomeadas / Estilo Win' : 'Convertidas (FFmpeg)'}
                      </div>
                      <div className="text-[11px] text-slate-400">Padronizadas em .{targetFormat.toUpperCase()}</div>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      {operationMode === 'rename_only' ? selectedCount : preservedCount}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">Já Compatíveis Preservadas</div>
                      <div className="text-[11px] text-slate-400">Sem recompressão sonora</div>
                    </div>
                  </div>
                </div>

                {/* Link de fallback caso o download automático tenha sido bloqueado pelo navegador */}
                {lastGeneratedZipUrl && (
                  <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300">
                      O download não começou sozinho?
                    </span>
                    <a
                      href={lastGeneratedZipUrl}
                      download={lastGeneratedZipName || `musicas_${targetFormat.toUpperCase()}.zip`}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Clique aqui para salvar o arquivo ZIP agora
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TABELA DE ARQUIVOS CONCLUÍDOS */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span>Resultado dos Arquivos ({completedCount} de {totalCount} prontos)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={clearQueueAndReset}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Processar Outro Pendrive</span>
                  </button>

                  <button
                    onClick={downloadAllAsZip}
                    disabled={isZipping}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar ZIP ({selectedCount})</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800 tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          title="Alternar seleção no ZIP"
                        >
                          {selectedIds.size === queue.length ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 w-10 text-center">Ouvir</th>
                      <th className="py-3 px-4">Nome Padronizado ({targetFormat.toUpperCase()})</th>
                      <th className="py-3 px-4">Origem</th>
                      <th className="py-3 px-4">Status no ZIP</th>
                      <th className="py-3 px-4 text-right">Individual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {queue.map((item, index) => {
                      const cleanName = getCleanTrackName(item, index);
                      const isPlaying = playingAudioKey === `${item.id}_after`;
                      const isSelected = selectedIds.size === 0 || selectedIds.has(item.id);

                      return (
                        <tr key={item.id} className={`transition ${isSelected ? 'hover:bg-slate-900/50' : 'opacity-40'}`}>
                          
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(item.id)}
                              className="rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700 cursor-pointer"
                              title="Incluir no ZIP"
                            />
                          </td>

                          {/* Ouvir o áudio final */}
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => togglePlayAudio(item, 'after')}
                              title={isPlaying ? 'Pausar áudio' : 'Ouvir faixa'}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition mx-auto ${
                                isPlaying
                                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                            </button>
                          </td>

                          {/* Nome final padronizado */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-mono text-emerald-300 font-semibold truncate max-w-xs sm:max-w-md" title={cleanName}>
                                {cleanName}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {item.finalSize ? formatBytes(item.finalSize) : formatBytes(item.file.size)}
                              </span>
                            </div>
                          </td>

                          {/* Formato original */}
                          <td className="py-3 px-4 text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {item.detection.detectedFormat}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            {item.status === 'processing' ? (
                              <div className="flex items-center gap-2 text-amber-400 text-xs font-sans">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{item.statusMessage}</span>
                              </div>
                            ) : item.status === 'completed' ? (
                              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-sans font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{item.statusMessage}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-xs font-sans">{item.statusMessage}</span>
                            )}
                          </td>

                          {/* Download individual */}
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => downloadSingleFile(item, index)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-sans font-medium transition inline-flex items-center gap-1 shadow-sm"
                            >
                              <Download className="w-3 h-3" />
                              <span>Baixar</span>
                            </button>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* NAVEGAÇÃO ETAPA 4 */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(3)}
                disabled={isProcessingBatch}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para Revisar Comparativo</span>
              </button>

              <button
                onClick={downloadAllAsZip}
                disabled={isZipping || totalCount === 0}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/40 transition flex items-center gap-2"
              >
                <Archive className="w-4 h-4" />
                <span>Baixar Todos em ZIP ({selectedCount})</span>
              </button>
            </div>

          </div>
        )}

          </>
        )}

      </main>

      {/* 5. RODAPÉ */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 py-5 px-4 mt-12 pb-24 text-slate-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-base">AudioFlix</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
              by Tasso
            </span>
          </div>

          <div className="text-slate-500 font-mono text-[11px]">
            AudioFlix © 2026 • <span className="text-emerald-400 font-semibold">by Tasso</span>
          </div>
        </div>
      </footer>

      {/* 6. FLASH SCREEN (SPLASH INICIAL) */}
      {showSplash && (
        <SplashScreen onFinish={() => setShowSplash(false)} />
      )}

      {/* 7. PLAYER GLOBAL DE MÚSICA COMPLETA */}
      {activePlayerTrack && (
        <AudioFlixPlayer
          currentTrack={activePlayerTrack}
          playlist={playerPlaylist}
          onTrackChange={(track) => setActivePlayerTrack(track)}
          onClose={() => setActivePlayerTrack(null)}
          onAddToLocalRepair={async (fileInfo) => {
            const file = new File([fileInfo.blob || new Blob([fileInfo.name])], fileInfo.name, { type: 'audio/mpeg' });
            await addFilesToQueue([file]);
            setAppMode('local_workflow');
          }}
        />
      )}

      {/* 7.1 FILA DE REPRODUÇÃO EM DISPOSITIVOS MÓVEIS */}
      <MobileQueueDrawer
        currentTrack={activePlayerTrack}
        onPlayTrack={(track) => setActivePlayerTrack(track)}
      />

      {/* 8. MODAL DE DOWNLOAD DE MÚSICA COMPLETA */}
      {downloadModalTrack && (
        <DownloadFullTrackModal
          track={downloadModalTrack}
          onClose={() => setDownloadModalTrack(null)}
          onAddToLocalRepair={async (fileInfo) => {
            const file = new File([fileInfo.blob || new Blob([fileInfo.name])], fileInfo.name, { type: 'audio/mpeg' });
            await addFilesToQueue([file]);
            setAppMode('local_workflow');
          }}
        />
      )}

    </div>
  );
}
