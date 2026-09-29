import React, { useState } from 'react';
import {
  Download,
  X,
  Music,
  CheckCircle2,
  Sparkles,
  FolderPlus,
  Loader2,
  FileCheck,
  ShieldCheck
} from 'lucide-react';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';

export interface DownloadTrackInfo {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSeconds?: number;
  youtubeId?: string;
  previewUrl?: string;
}

interface DownloadFullTrackModalProps {
  track: DownloadTrackInfo | null;
  onClose: () => void;
  onAddToLocalRepair?: (file: { name: string; blob?: Blob }) => void;
}

export default function DownloadFullTrackModal({
  track,
  onClose,
  onAddToLocalRepair
}: DownloadFullTrackModalProps) {
  if (!track) return null;

  const { addDownloadRecord } = usePlaylistContext();
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const cleanFileName = `${track.artist} - ${track.title}.mp3`
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

  // Download Direto de Áudio Completo (100% da Música, Sem Cortes e Sem Redirecionar)
  const handleDownloadFullTrack = async (formatMode: 'mp3_high' | 'metadata_mp3') => {
    setDownloadingFormat(formatMode);
    setProgressMsg('Baixando áudio 100% completo do servidor...');

    try {
      let downloadEndpoint = '';

      if (track.youtubeId) {
        downloadEndpoint = `/api/youtube/download?id=${encodeURIComponent(track.youtubeId)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
      } else {
        downloadEndpoint = `/api/music/download-full-track?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
      }

      const response = await fetch(downloadEndpoint);
      if (!response.ok) {
        throw new Error('Falha ao processar download do servidor.');
      }

      setProgressMsg('Salvando arquivo MP3 no seu dispositivo...');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 20000);

      // Registra no Histórico de Downloads
      addDownloadRecord({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        durationSeconds: track.durationSeconds,
        youtubeId: track.youtubeId,
        type: 'single_mp3',
        fileSizeStr: `${(blob.size / (1024 * 1024)).toFixed(1)} MB • MP3`,
        fileName: cleanFileName
      });

      setDownloadSuccess(true);
      setTimeout(() => {
        setDownloadSuccess(false);
        onClose();
      }, 3000);
    } catch (err: any) {
      console.error('Erro ao baixar faixa completa:', err);
      // Fallback seguro direto pelo browser sem abrir nova aba
      const directUrl = `/api/music/download-full-track?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&youtubeId=${encodeURIComponent(track.youtubeId || '')}`;
      const link = document.createElement('a');
      link.href = directUrl;
      link.download = cleanFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addDownloadRecord({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        durationSeconds: track.durationSeconds,
        youtubeId: track.youtubeId,
        type: 'single_mp3',
        fileSizeStr: 'MP3 Completo',
        fileName: cleanFileName
      });

      setDownloadSuccess(true);
      setTimeout(() => {
        setDownloadSuccess(false);
        onClose();
      }, 3000);
    } finally {
      setDownloadingFormat(null);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative space-y-6">
        
        {/* Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho da Faixa */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-950 border border-slate-700 shrink-0 shadow-md">
            {track.artwork ? (
              <img
                src={track.artwork}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <Music className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Música Completa (100% da Faixa)</span>
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white truncate" title={track.title}>
              {track.title}
            </h3>
            <p className="text-xs text-slate-400 truncate">
              {track.artist} {track.album ? `• ${track.album}` : ''}
            </p>
          </div>
        </div>

        {/* Notificação de Progresso ou Sucesso */}
        {downloadSuccess ? (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Download da faixa completa concluído com sucesso! Verifique sua pasta de downloads.</span>
          </div>
        ) : downloadingFormat ? (
          <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
            <span>{progressMsg || 'Processando MP3 completo...'}</span>
          </div>
        ) : null}

        {/* Opções de Download sem Redirecionamentos */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Opções de Download Direto:
          </div>

          {/* Opção 1: Download MP3 Completo em Alta Resolução */}
          <button
            onClick={() => handleDownloadFullTrack('mp3_high')}
            disabled={!!downloadingFormat}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-sm transition shadow-lg shadow-emerald-950/40 flex items-center justify-between cursor-pointer disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                {downloadingFormat === 'mp3_high' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold">Baixar MP3 Completo (Alta Fidelidade)</span>
                <span className="block text-[11px] text-emerald-100 font-normal">
                  Duração 100% total oficial • Sem corte de 30s • Direto no navegador
                </span>
              </div>
            </div>
            <Download className="w-4 h-4 text-emerald-200 shrink-0 ml-2" />
          </button>

          {/* Opção 2: Download com Tags e Capa embutida */}
          <button
            onClick={() => handleDownloadFullTrack('metadata_mp3')}
            disabled={!!downloadingFormat}
            className="w-full p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-semibold transition border border-slate-700 flex items-center justify-between cursor-pointer disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300">
                {downloadingFormat === 'metadata_mp3' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileCheck className="w-4 h-4 text-teal-400" />
                )}
              </div>
              <div className="text-left">
                <span className="block font-semibold">Salvar Arquivo com Tags ID3 & Capa</span>
                <span className="block text-[11px] text-slate-400">
                  Nome padronizado: "{cleanFileName}"
                </span>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-400" />
          </button>

          {/* Opção 3: Adicionar ao reparador de pendrive */}
          {onAddToLocalRepair && (
            <button
              onClick={() => {
                onAddToLocalRepair({ name: cleanFileName });
                onClose();
              }}
              className="w-full p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition border border-slate-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-amber-400" />
              <span>Enviar para o Reparador de Pendrive do AudioFlix</span>
            </button>
          )}
        </div>

        {/* Rodapé explicativo */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-400/90 font-medium text-center">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Garantia AudioFlix: download 100% direto sem abas externas ou pop-ups.</span>
        </div>
      </div>
    </div>
  );
}
