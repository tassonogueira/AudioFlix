import React from 'react';
import {
  Search,
  FolderUp,
  ArrowRight,
  Headphones,
  Heart,
  Download,
  ListPlus,
  Play,
  Sparkles,
  HardDrive
} from 'lucide-react';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';

interface InitialHubSelectorProps {
  onSelectSearch: (initialQuery?: string) => void;
  onSelectRepair: () => void;
  onSelectPlaylists?: () => void;
  onSelectDownloads?: () => void;
  onLoadSamples: () => void;
}

export default function InitialHubSelector({
  onSelectSearch,
  onSelectRepair,
  onSelectPlaylists,
  onSelectDownloads
}: InitialHubSelectorProps) {
  const { favorites, playlists, downloads } = usePlaylistContext();

  const quickArtistPills = [
    'Jorge & Mateus',
    'Henrique & Juliano',
    'Gusttavo Lima',
    'Marília Mendonça',
    'Coldplay',
    'Queen'
  ];

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-10 px-4 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Áudio Contínuo em Segundo Plano • PiP Sob Demanda • Downloads 100% no Dispositivo</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          O que você deseja fazer agora?
        </h1>
      </div>

      {/* 3 Primary Decision Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        
        {/* CARD 1: BUSCAR ÁLBUNS E DISCOGRAFIAS */}
        <div className="group bg-slate-900/90 hover:bg-slate-900 border-2 border-emerald-500/40 hover:border-emerald-400 rounded-3xl p-6 sm:p-7 transition-all duration-300 shadow-xl shadow-emerald-950/20 hover:shadow-2xl hover:shadow-emerald-900/30 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-13 h-13 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 group-hover:bg-emerald-500/20 transition-all">
              <Search className="w-7 h-7" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                Catálogo Oficial & Capas HD
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Buscar Músicas & Álbuns
              </h2>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Explore discografias, álbuns de estúdio e ao vivo com áudio 100% completo e download direto para o seu dispositivo.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => onSelectSearch()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-950/60 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Headphones className="w-4 h-4" />
              <span>Explorar Catálogo</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            {/* Quick Artist Shortcuts */}
            <div className="flex flex-wrap items-center justify-center gap-1">
              {quickArtistPills.slice(0, 4).map((artist) => (
                <button
                  key={artist}
                  onClick={() => onSelectSearch(artist)}
                  className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-emerald-500/40 transition cursor-pointer"
                >
                  {artist}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CARD 2: MINHAS PLAYLISTS & FAVORITAS */}
        <div className="group bg-slate-900/90 hover:bg-slate-900 border-2 border-slate-800 hover:border-rose-500/60 rounded-3xl p-6 sm:p-7 transition-all duration-300 shadow-xl shadow-slate-950/50 hover:shadow-2xl hover:shadow-rose-950/20 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-13 h-13 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-105 group-hover:bg-rose-500/20 transition-all">
              <Heart className="w-7 h-7 fill-current" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block mb-1">
                Suas Coleções Pessoais
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Playlists & Favoritas
              </h2>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Crie suas próprias listas, salve suas faixas preferidas e toque com reprodução contínua e tela bloqueada.
            </p>
          </div>

          <div>
            <button
              onClick={() => onSelectPlaylists?.()}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold text-sm rounded-2xl shadow-lg shadow-rose-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Heart className="w-4 h-4 fill-current" />
              <span>Acessar Minhas Listas</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        {/* CARD 3: REPARAR ARQUIVOS DE ÁUDIO (PENDRIVE) */}
        <div className="group bg-slate-900/90 hover:bg-slate-900 border-2 border-slate-800 hover:border-amber-500/60 rounded-3xl p-6 sm:p-7 transition-all duration-300 shadow-xl shadow-slate-950/50 hover:shadow-2xl hover:shadow-amber-950/20 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-13 h-13 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 group-hover:bg-amber-500/20 transition-all">
              <FolderUp className="w-7 h-7" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Utilitário de Pendrive
              </span>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Reparar Pendrive
              </h2>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Conserte arquivos que não tocam no som do carro, padronize títulos e exporte em MP3 100% compatível.
            </p>
          </div>

          <div>
            <button
              onClick={() => onSelectRepair()}
              className="w-full py-3 bg-slate-800 hover:bg-amber-600 active:scale-[0.98] text-white font-bold text-sm rounded-2xl border border-slate-700 hover:border-amber-500 shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderUp className="w-4 h-4 text-amber-400 group-hover:text-white" />
              <span>Reparar Meu Pendrive</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

      </div>

      {/* BANNER RÁPIDO: MEUS DOWNLOADS SALVOS */}
      {onSelectDownloads && (
        <div
          onClick={onSelectDownloads}
          className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer transition group shadow-md"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="truncate">
              <span className="text-sm font-bold text-white block group-hover:text-emerald-300 transition">
                Meus Downloads ({downloads.length} {downloads.length === 1 ? 'arquivo' : 'arquivos'})
              </span>
              <span className="text-xs text-slate-400 block mt-0.5">
                Acesse todas as músicas e álbuns baixados no seu dispositivo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 group-hover:text-emerald-300 shrink-0">
            <span className="hidden sm:inline">Ver Downloads</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      )}
    </div>
  );
}
