import React, { useState, useEffect } from 'react';
import {
  Search,
  Headphones,
  Flame,
  ArrowRight,
  X,
  Sparkles
} from 'lucide-react';

interface InitialHubSelectorProps {
  onSelectSearch: (initialQuery?: string) => void;
  onSelectRepair?: () => void;
  onSelectPlaylists?: () => void;
  onSelectDownloads?: () => void;
  onSelectCharts?: () => void;
  onLoadSamples?: () => void;
  onPlayLocalFiles?: (files: File[]) => void;
}

const PLACEHOLDER_SUGGESTIONS = [
  'Ex: Coldplay, Imagine Dragons...',
  'Ex: Flashback anos 80 e 90...',
  'Ex: Henrique & Juliano, Ana Castela...',
  'Ex: Queen, Bon Jovi, Guns N\' Roses...',
  'Ex: Alok, Vintage Culture, Eletrônica...',
  'Digite qualquer artista, música ou álbum...'
];

const QUICK_SEARCH_CHIPS = [
  { label: '🔥 Em Alta', query: 'Top Hits 2024' },
  { label: '📻 Flashback', query: 'Flashback Anos 80 90' },
  { label: '🤠 Sertanejo', query: 'Sertanejo Sucessos' },
  { label: '🎸 Rock Clássico', query: 'Rock Clássicos' }
];

export default function InitialHubSelector({
  onSelectSearch,
  onSelectCharts
}: InitialHubSelectorProps) {
  const [queryInput, setQueryInput] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Efeito de transição suave do placeholder moderno a cada 3.5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      onSelectSearch(queryInput.trim());
    } else {
      onSelectSearch();
    }
  };

  const handleChipClick = (query: string) => {
    setQueryInput(query);
    onSelectSearch(query);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-1 sm:py-2 flex flex-col justify-center items-center space-y-2.5 sm:space-y-4 animate-in fade-in duration-300">
      
      {/* SEÇÃO HERO COM MOVIMENTO LEVE E CHAMATIVO */}
      <div className="relative text-center space-y-1.5 sm:space-y-2.5 max-w-2xl mx-auto select-none">
        {/* Aura ambiente sutil e pulsante de iluminação de fundo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 sm:w-96 h-20 sm:h-32 bg-emerald-500/15 blur-3xl rounded-full pointer-events-none animate-pulse-glow" />

        {/* Título com gradiente animado suave (shimmer) e leve flutuação */}
        <div className="relative animate-float-subtle">
          <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-snug sm:leading-tight text-white animate-text-shimmer bg-gradient-to-r from-white via-emerald-200 to-white bg-clip-text">
            O que você quer ouvir agora?
          </h1>
        </div>

        {/* Subtítulo dinâmico e refinado */}
        <p className="text-[11px] sm:text-xs md:text-sm text-slate-300/90 max-w-md sm:max-w-lg mx-auto leading-tight sm:leading-relaxed relative z-10 font-normal">
          Pesquise qualquer artista, álbum ou música para tocar instantaneamente com{' '}
          <span className="text-emerald-400 font-semibold drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
            reprodução contínua
          </span>{' '}
          e download no dispositivo.
        </p>

        {/* CAIXA DE PESQUISA MODERNA COM BORDA LUMINOSA E GLASSMORPHISM */}
        <form onSubmit={handleSearchSubmit} className="pt-0.5 sm:pt-1 max-w-xl mx-auto w-full relative z-20">
          <div className="group relative rounded-xl sm:rounded-2xl p-[1px] bg-gradient-to-r from-slate-700 via-emerald-500/50 to-slate-700 hover:via-emerald-400 focus-within:via-emerald-400 transition-all duration-300 shadow-xl shadow-black/50 focus-within:shadow-emerald-500/15">
            <div className="relative flex items-center bg-slate-900/90 backdrop-blur-xl rounded-xl sm:rounded-2xl px-3 py-1.5 sm:py-2.5 gap-2">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0 group-focus-within:scale-110 transition-transform duration-200" />
              
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={PLACEHOLDER_SUGGESTIONS[placeholderIndex]}
                className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
              />

              {queryInput && (
                <button
                  type="button"
                  onClick={() => setQueryInput('')}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
                  title="Limpar pesquisa"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="submit"
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-95 text-slate-950 font-black text-xs rounded-lg sm:rounded-xl shadow-md shadow-emerald-500/30 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Buscar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* CHIPS RÁPIDOS INTERATIVOS ABAIXO DA BUSCA */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1.5 text-[10px] sm:text-[11px]">
            {QUICK_SEARCH_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleChipClick(chip.query)}
                className="px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/40 transition cursor-pointer text-[10px] sm:text-[11px]"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* OS 2 CARDS ESSENCIAIS (LADO A LADO EM 2 COLUNAS COMPACTAS PARA NÃO ROLAR) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 max-w-2xl w-full mx-auto pt-0.5">
        
        {/* CARD 1: BUSCAR MÚSICAS & ÁLBUNS */}
        <div
          onClick={() => onSelectSearch(queryInput || undefined)}
          className="group bg-slate-900/85 hover:bg-slate-900 border border-emerald-500/30 hover:border-emerald-400 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 transition-all duration-200 shadow-lg shadow-emerald-950/20 hover:shadow-emerald-900/30 flex flex-col justify-between space-y-2 sm:space-y-3 cursor-pointer"
        >
          <div className="space-y-1 sm:space-y-2">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-all">
              <Headphones className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
            </div>

            <div>
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-400 block truncate">
                Catálogo Completo & Capas HD
              </span>
              <h2 className="text-xs sm:text-base font-black text-white tracking-tight leading-snug">
                Buscar Músicas & Álbuns
              </h2>
            </div>

            <p className="text-[10px] sm:text-xs text-slate-400 leading-tight sm:leading-relaxed line-clamp-2">
              Discografias, DVDs ao vivo e faixas avulsas 100% completas sem 30s.
            </p>
          </div>

          <div className="w-full py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] sm:text-xs rounded-lg sm:rounded-xl shadow-md transition flex items-center justify-center gap-1.5">
            <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>Explorar Catálogo</span>
            <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </div>

        {/* CARD 2: MÚSICAS MAIS OUVIDAS (RANKINGS OFICIAIS) */}
        <div
          onClick={() => onSelectCharts?.()}
          className="group bg-slate-900/85 hover:bg-slate-900 border border-amber-500/30 hover:border-amber-400 rounded-xl sm:rounded-2xl p-3 sm:p-4.5 transition-all duration-200 shadow-lg shadow-amber-950/20 hover:shadow-amber-900/30 flex flex-col justify-between space-y-2 sm:space-y-3 cursor-pointer"
        >
          <div className="space-y-1 sm:space-y-2">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-all">
              <Flame className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
            </div>

            <div>
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-400 block truncate">
                Top Rankings & Anos
              </span>
              <h2 className="text-xs sm:text-base font-black text-white tracking-tight leading-snug">
                Músicas Mais Ouvidas
              </h2>
            </div>

            <p className="text-[10px] sm:text-xs text-slate-400 leading-tight sm:leading-relaxed line-clamp-2">
              Paradas oficiais por países (Brasil, Global), anos 70/80/90/2000 e gêneros.
            </p>
          </div>

          <div className="w-full py-1.5 sm:py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 text-slate-950 font-black text-[10px] sm:text-xs rounded-lg sm:rounded-xl shadow-md transition flex items-center justify-center gap-1.5">
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-slate-950 text-slate-950" />
            <span>Mais Tocadas</span>
            <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </div>

      </div>

    </div>
  );
}
