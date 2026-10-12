import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic2,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  AlignLeft,
  Loader2,
  RefreshCw,
  Volume2,
  VolumeX,
  Clock,
  Heart
} from 'lucide-react';
import { PlayerTrack } from './AudioFlixPlayer.tsx';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsResponse {
  found: boolean;
  title?: string;
  artist?: string;
  isSynced: boolean;
  lines: LyricLine[];
  plainLyrics: string | null;
  message?: string;
}

interface KaraokeLyricsModalProps {
  track: PlayerTrack;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export default function KaraokeLyricsModal({
  track,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onNext,
  onPrev,
  onClose
}: KaraokeLyricsModalProps) {
  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'synced' | 'plain'>('synced');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const linesContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Busca as letras na rota /api/music/lyrics
  const fetchLyrics = () => {
    if (!track?.title) return;
    setIsLoading(true);
    setErrorMsg(null);

    const durParam = duration && duration > 0 ? `&duration=${Math.round(duration)}` : '';
    fetch(`/api/music/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}${durParam}`)
      .then((res) => {
        if (!res.ok) throw new Error('Não foi possível carregar a letra');
        return res.json();
      })
      .then((data: LyricsResponse) => {
        setLyricsData(data);
        if (!data.found) {
          setErrorMsg(data.message || 'Letra não encontrada para esta faixa.');
        } else if (!data.isSynced) {
          setViewMode('plain');
        } else {
          setViewMode('synced');
        }
      })
      .catch((err) => {
        setErrorMsg('Falha ao conectar com o servidor de letras.');
        console.warn('Erro ao carregar letra:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchLyrics();
  }, [track.id, track.title, track.artist]);

  // Identifica a linha sincronizada ativa no segundo atual
  const activeLineIndex = (() => {
    if (!lyricsData || !lyricsData.isSynced || lyricsData.lines.length === 0) return -1;
    const lines = lyricsData.lines;
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const nextLine = lines[i + 1];
      if (currentTime >= currentLine.time && (!nextLine || currentTime < nextLine.time)) {
        return i;
      }
    }
    // Se o áudio ainda estiver antes da primeira linha
    if (currentTime < lines[0].time) return -1;
    return lines.length - 1;
  })();

  // Rolagem automática suave para centralizar a linha ativa
  useEffect(() => {
    if (!autoScroll || viewMode !== 'synced' || activeLineIndex < 0) return;
    const activeEl = lineRefs.current[activeLineIndex];
    if (activeEl && linesContainerRef.current) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeLineIndex, autoScroll, viewMode]);

  const formatTime = (sec?: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between overflow-hidden animate-in fade-in duration-200 select-none">
      {/* Luz ambiente de fundo sincronizada com a capa */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* CABEÇALHO */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0 border-b border-slate-800/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
            <Mic2 className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-white truncate">
                Karaokê & Letras Sincronizadas
              </h2>
              {lyricsData?.isSynced && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <Sparkles className="w-2.5 h-2.5" /> Sincronizado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              {track.title} • <span className="text-slate-300">{track.artist}</span>
            </p>
          </div>
        </div>

        {/* Controles Topo Direito: Modo Karaokê vs Letra Estática & Fechar */}
        <div className="flex items-center gap-2 shrink-0">
          {lyricsData?.isSynced && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('synced')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'synced'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Acompanhamento ao vivo com timestamps"
              >
                <Mic2 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Karaokê</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('plain')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'plain'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Ver letra completa em texto corrido"
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Texto</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={fetchLyrics}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition cursor-pointer"
            title="Recarregar letra"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition cursor-pointer"
            title="Fechar Karaokê"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ÁREA CENTRAL: LETRA ROLÁVEL */}
      <main
        ref={linesContainerRef}
        onWheel={() => setAutoScroll(false)}
        onTouchMove={() => setAutoScroll(false)}
        className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto px-4 sm:px-8 py-8 sm:py-12 no-scrollbar z-10"
      >
        {isLoading ? (
          <div className="h-full min-h-[350px] flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-base font-bold text-white">Buscando letra sincronizada...</p>
              <p className="text-xs text-slate-400">Consultando base internacional e nacional de karaokê</p>
            </div>
          </div>
        ) : errorMsg || !lyricsData || (!lyricsData.lines.length && !lyricsData.plainLyrics) ? (
          <div className="h-full min-h-[350px] flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
              <Music className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Letra ainda não disponível</h3>
              <p className="text-xs text-slate-400">
                {errorMsg || 'Esta música ainda não possui letra sincronizada cadastrada no catálogo.'}
              </p>
            </div>
            <button
              onClick={fetchLyrics}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        ) : viewMode === 'synced' && lyricsData.isSynced ? (
          /* MODO 1: KARAOKÊ AO VIVO COM TIMESTAMPS */
          <div className="space-y-6 sm:space-y-8 text-center pb-20 pt-6">
            {!autoScroll && (
              <div className="sticky top-0 z-20 flex justify-center pb-4">
                <button
                  type="button"
                  onClick={() => setAutoScroll(true)}
                  className="px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer animate-in fade-in"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Voltar para acompanhamento automático</span>
                </button>
              </div>
            )}

            {lyricsData.lines.map((line, idx) => {
              const isActive = idx === activeLineIndex;
              const isPast = activeLineIndex >= 0 && idx < activeLineIndex;

              // Linha em branco ou instrumental
              if (!line.text.trim()) {
                return (
                  <div
                    key={idx}
                    ref={(el) => {
                      lineRefs.current[idx] = el;
                    }}
                    className="h-4 sm:h-6"
                  />
                );
              }

              return (
                <div
                  key={idx}
                  ref={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                  onClick={() => {
                    onSeek(line.time);
                    setAutoScroll(true);
                  }}
                  className={`group relative transition-all duration-300 py-2 sm:py-3 px-4 rounded-2xl cursor-pointer ${
                    isActive
                      ? 'scale-105 sm:scale-110 bg-emerald-500/10 border border-emerald-500/30 shadow-xl shadow-emerald-950/40'
                      : isPast
                      ? 'opacity-40 hover:opacity-75 hover:bg-slate-900/60'
                      : 'opacity-65 hover:opacity-100 hover:bg-slate-900/80'
                  }`}
                  title={`Ir para ${formatTime(line.time)}`}
                >
                  <p
                    className={`font-black tracking-tight leading-relaxed transition-all ${
                      isActive
                        ? 'text-xl sm:text-3xl lg:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-white to-teal-300 drop-shadow-md'
                        : 'text-base sm:text-xl lg:text-2xl text-slate-300 group-hover:text-white'
                    }`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          /* MODO 2: TEXTO COMPLETO CORRIDO */
          <div className="max-w-2xl mx-auto space-y-4 text-center py-6 pb-20">
            <div className="p-6 sm:p-8 bg-slate-900/70 border border-slate-800 rounded-3xl shadow-xl">
              <pre className="font-sans text-sm sm:text-base text-slate-200 leading-loose whitespace-pre-wrap select-text">
                {lyricsData.plainLyrics ||
                  lyricsData.lines.map((l) => l.text).join('\n')}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* RODAPÉ: CONTROLES EMBUTIDOS DE REPRODUÇÃO & TIMELINE */}
      <footer className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 z-20 shrink-0 bg-slate-950/90 border-t border-slate-800/80 backdrop-blur-xl">
        {/* Timeline Scrubbable */}
        <div className="space-y-1.5 pb-2">
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
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span className="text-[11px] text-emerald-400 font-sans hidden sm:inline">
              Toque em qualquer verso para pular o áudio
            </span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controles Principais */}
        <div className="flex items-center justify-between pt-1">
          {/* Lado Esquerdo: Mini Capa e Informação */}
          <div className="flex items-center gap-3 min-w-0 max-w-[200px] sm:max-w-xs">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
              {track.artwork ? (
                <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Music className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white truncate block">{track.title}</span>
              <span className="text-[11px] text-slate-400 truncate block">{track.artist}</span>
            </div>
          </div>

          {/* Centro: Prev, Play/Pause, Next */}
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={onPrev}
              className="p-2 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
              title="Faixa anterior"
            >
              <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={onTogglePlay}
              className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-emerald-500/30 active:scale-95 cursor-pointer"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-2 text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
              title="Próxima faixa"
            >
              <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Lado Direito: Fechar */}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </footer>
    </div>
  );
}
