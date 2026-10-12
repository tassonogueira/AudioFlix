import React, { useState, useEffect } from 'react';
import {
  Flame,
  Globe,
  Music,
  Play,
  Pause,
  ListPlus,
  Heart,
  Download,
  Sparkles,
  Loader2,
  Check,
  Disc,
  Headphones,
  Calendar,
  Layers,
  ListCheck
} from 'lucide-react';
import { PlayerTrack } from './AudioFlixPlayer.tsx';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';
import { DownloadTrackInfo } from './DownloadFullTrackModal.tsx';

interface ChartTrack {
  id: string;
  rank: number;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  artwork?: string;
}

interface ChartPayload {
  chartInfo: {
    title: string;
    subtitle: string;
    flagOrIcon: string;
    type: 'country' | 'genre';
    code: string;
    year?: string;
    playlistCover: string;
    totalTracks: number;
    updatedAt: string;
  };
  availableCountries: Array<{ code: string; title: string; flag: string }>;
  availableYears: Array<{ code: string; label: string }>;
  availableGenres: Array<{ code: string; title: string; icon: string }>;
  tracks: ChartTrack[];
}

export interface TopChartsViewProps {
  onPlayTrack: (track: PlayerTrack, playlist?: PlayerTrack[]) => void;
  onAddToQueue: (track: PlayerTrack) => void;
  onOpenDownloadModal: (track: DownloadTrackInfo) => void;
  activePlayingTrackId?: string | number | null;
  isPlayingFullTrack?: boolean;
}

export default function TopChartsView({
  onPlayTrack,
  onAddToQueue,
  onOpenDownloadModal,
  activePlayingTrackId,
  isPlayingFullTrack
}: TopChartsViewProps) {
  const { isFavorite, toggleFavorite, openAddToPlaylistModal, toggleQueue, isInQueue, showToast } = usePlaylistContext();

  const [chartType, setChartType] = useState<'country' | 'genre'>('country');
  const [selectedCountry, setSelectedCountry] = useState<string>('br');
  const [selectedYear, setSelectedYear] = useState<string>('atual');
  const [selectedGenre, setSelectedGenre] = useState<string>('sertanejo');
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [justQueuedId, setJustQueuedId] = useState<string | null>(null);

  // Busca dados do ranking na API do backend com suporte a País e Período (Ano)
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    const code = chartType === 'country' ? selectedCountry : selectedGenre;
    const yearParam = selectedYear !== 'atual' ? selectedYear : '';
    
    fetch(`/api/music/charts?type=${chartType}&code=${encodeURIComponent(code)}&year=${encodeURIComponent(yearParam)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar ranking');
        return res.json();
      })
      .then((data: ChartPayload) => {
        if (!isCancelled) {
          setChartData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao buscar ranking:', err);
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [chartType, selectedCountry, selectedYear, selectedGenre]);

  const formatSeconds = (sec?: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const convertChartTrackToPlayerTrack = (track: ChartTrack): PlayerTrack => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album || chartData?.chartInfo.title || 'Paradas Musicais',
    artwork: track.artwork || chartData?.chartInfo.playlistCover,
    durationSeconds: track.durationSeconds,
    previewUrl: (track as any).previewUrl
  });

  // Tocar todas as faixas do chart em ordem
  const handlePlayAll = () => {
    if (!chartData || chartData.tracks.length === 0) return;
    const formattedList = chartData.tracks.map(convertChartTrackToPlayerTrack);
    onPlayTrack(formattedList[0], formattedList);
    showToast(`▶️ Reproduzindo "${formattedList[0].title}" e adicionadas ${formattedList.length} faixas à fila!`);
  };

  // Adicionar todas as faixas do chart na fila sem tocar agora
  const handleQueueAll = () => {
    if (!chartData || chartData.tracks.length === 0) return;
    chartData.tracks.forEach((t) => {
      onAddToQueue(convertChartTrackToPlayerTrack(t));
    });
    showToast(`🎵 ${chartData.tracks.length} músicas do ranking adicionadas à fila de reprodução!`);
  };

  const yearsList = chartData?.availableYears || [
    { code: 'atual', label: 'Hoje (Em Alta)' },
    { code: '2024', label: '2024' },
    { code: '2023', label: '2023' },
    { code: '2022', label: '2022' },
    { code: '2021', label: '2021' },
    { code: '2020', label: '2020' },
    { code: '2019', label: '2019' },
    { code: '2018', label: '2018' },
    { code: '2015', label: '2015' },
    { code: '2010', label: '2010' },
    { code: '2000', label: 'Anos 2000' },
    { code: '1990', label: 'Anos 90' },
    { code: '1980', label: 'Anos 80' },
    { code: '1970', label: 'Anos 70' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* CABEÇALHO DO MOSTRADOR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  Músicas Mais Ouvidas
                </h2>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Paradas Oficiais
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Filtre as músicas mais tocadas por país, por época (ano) ou por gênero musical com áudio 100% completo
              </p>
            </div>
          </div>

          {/* Seletor de Tipo: Países & Anos vs Gêneros */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setChartType('country')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                chartType === 'country'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Por País & Ano</span>
            </button>
            <button
              onClick={() => setChartType('genre')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                chartType === 'genre'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Por Gêneros</span>
            </button>
          </div>
        </div>

        {/* SUBSELEÇÃO 1: FILTRO DE PAÍSES (Se modo país) */}
        {chartType === 'country' ? (
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            {/* Lista de Países */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Escolha o País / Região:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(chartData?.availableCountries || [
                  { code: 'br', title: 'Brasil', flag: '🇧🇷' },
                  { code: 'global', title: 'Global', flag: '🌐' },
                  { code: 'us', title: 'Estados Unidos', flag: '🇺🇸' },
                  { code: 'gb', title: 'Reino Unido', flag: '🇬🇧' },
                  { code: 'pt', title: 'Portugal', flag: '🇵🇹' },
                  { code: 'es', title: 'Espanha', flag: '🇪🇸' },
                  { code: 'mx', title: 'México', flag: '🇲🇽' },
                  { code: 'ar', title: 'Argentina', flag: '🇦🇷' },
                  { code: 'it', title: 'Itália', flag: '🇮🇹' },
                  { code: 'fr', title: 'França', flag: '🇫🇷' },
                  { code: 'de', title: 'Alemanha', flag: '🇩🇪' },
                  { code: 'jp', title: 'Japão', flag: '🇯🇵' }
                ]).map((country) => (
                  <button
                    key={country.code}
                    onClick={() => setSelectedCountry(country.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-2 cursor-pointer border ${
                      selectedCountry === country.code
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-sm">{country.flag}</span>
                    <span>{country.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Períodos / Anos */}
            <div className="pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Filtrar por Época / Ano:</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {yearsList.map((y) => {
                  const isSelected = selectedYear === y.code;
                  return (
                    <button
                      key={y.code}
                      onClick={() => setSelectedYear(y.code)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {y.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* SUBSELEÇÃO 2: GÊNEROS MUSICAIS (COM FILTRO DE ANO INCLUSO) */
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            {/* Lista de Gêneros com Flashback em destaque */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                <span>Escolha o Gênero Musical:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(chartData?.availableGenres || [
                  { code: 'flashback', title: 'Flashback & Clássicos', icon: '📻' },
                  { code: 'sertanejo', title: 'Top Sertanejo', icon: '🤠' },
                  { code: 'pop', title: 'Pop Internacional', icon: '🎤' },
                  { code: 'funk', title: 'Funk Brasil', icon: '🇧🇷' },
                  { code: 'pagode', title: 'Pagode & Samba', icon: '🥁' },
                  { code: 'rock', title: 'Rock Classics', icon: '🎸' },
                  { code: 'trap', title: 'Trap Brasil', icon: '⚡' },
                  { code: 'forro', title: 'Forró & Piseiro', icon: '🪗' },
                  { code: 'mpb', title: 'Grandes Clássicos MPB', icon: '🌿' },
                  { code: 'eletronica', title: 'Eletrônica & Dance', icon: '🎧' },
                  { code: 'hiphop', title: 'Rap & Hip-Hop', icon: '🌍' },
                  { code: 'latino', title: 'Reggaeton & Latino', icon: '💃' },
                  { code: 'virais', title: 'Hits Virais', icon: '🔥' },
                  { code: 'chill', title: 'Acústico & Chill', icon: '☕' }
                ]).map((genre) => (
                  <button
                    key={genre.code}
                    onClick={() => setSelectedGenre(genre.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer border ${
                      selectedGenre === genre.code
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span>{genre.icon}</span>
                    <span>{genre.title.replace('Top ', '')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Períodos / Anos para o Gênero */}
            <div className="pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Filtrar por Época / Ano no Gênero:</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {yearsList.map((y) => {
                  const isSelected = selectedYear === y.code;
                  return (
                    <button
                      key={y.code}
                      onClick={() => setSelectedYear(y.code)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {y.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BANNER DO RANKING ATIVO & BOTÕES DE AÇÃO */}
      {chartData && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-700 shrink-0 relative shadow-md flex items-center justify-center">
              {chartData.chartInfo.playlistCover ? (
                <img
                  src={chartData.chartInfo.playlistCover}
                  alt={chartData.chartInfo.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Disc className="w-8 h-8" />
                </div>
              )}
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-300">
                {chartData.chartInfo.flagOrIcon}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                  {chartType === 'country' ? 'Parada por País & Ano' : 'Parada por Gênero'}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-[11px] text-slate-400">
                  {chartData.chartInfo.totalTracks} faixas encontradas
                </span>
                {selectedYear && selectedYear !== 'atual' && chartType === 'country' && (
                  <span className="px-2 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold font-mono">
                    Ano: {selectedYear}
                  </span>
                )}
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {chartData.chartInfo.title}
              </h3>
              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                {chartData.chartInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handlePlayAll}
              disabled={isLoading || chartData.tracks.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
              title="Tocar todas as músicas do ranking em sequência"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tocar Todas</span>
            </button>

            <button
              onClick={handleQueueAll}
              disabled={isLoading || chartData.tracks.length === 0}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Adicionar todas as músicas à fila de reprodução"
            >
              <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Fila ({chartData.tracks.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE FAIXAS RANQUEADAS */}
      {isLoading ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-300">
            Carregando ranking musical oficial...
          </p>
          <p className="text-xs text-slate-500">
            Sincronizando faixas mais ouvidas e capas em alta definição
          </p>
        </div>
      ) : !chartData || chartData.tracks.length === 0 ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <Sparkles className="w-7 h-7 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">Nenhuma faixa encontrada para este filtro no momento.</p>
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-800/80">
            {chartData.tracks.map((track) => {
              const isCurrentPlaying = String(activePlayingTrackId) === String(track.id);
              const playerTrack = convertChartTrackToPlayerTrack(track);
              const isFav = isFavorite(track.id);
              const isJustQueued = justQueuedId === track.id;

              return (
                <div
                  key={track.id}
                  className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 transition group hover:bg-slate-800/50 ${
                    isCurrentPlaying ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  {/* Lado Esquerdo: Rank, Capa e Nome */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Badge de Posição / Ranking */}
                    <div className="w-7 sm:w-8 shrink-0 text-center">
                      {track.rank === 1 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black" title="1º Lugar">
                          1º
                        </span>
                      ) : track.rank === 2 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300/20 text-slate-200 border border-slate-400/40 text-xs font-black" title="2º Lugar">
                          2º
                        </span>
                      ) : track.rank === 3 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-400 border border-amber-600/40 text-xs font-black" title="3º Lugar">
                          3º
                        </span>
                      ) : (
                        <span className="text-xs font-mono font-bold text-slate-500">
                          #{track.rank}
                        </span>
                      )}
                    </div>

                    {/* Capa */}
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative flex items-center justify-center group-hover:border-slate-700 transition">
                      {track.artwork ? (
                        <img
                          src={track.artwork}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Botão Play rápido */}
                    <button
                      onClick={() => onPlayTrack(playerTrack, chartData.tracks.map(convertChartTrackToPlayerTrack))}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                        isCurrentPlaying && isPlayingFullTrack
                          ? 'bg-emerald-500 text-slate-950 shadow-md animate-pulse'
                          : 'bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300'
                      }`}
                      title={isCurrentPlaying && isPlayingFullTrack ? 'Tocando agora' : 'Ouvir agora'}
                    >
                      {isCurrentPlaying && isPlayingFullTrack ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Título e Artista */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4
                          onClick={() => onPlayTrack(playerTrack, chartData.tracks.map(convertChartTrackToPlayerTrack))}
                          className="text-xs sm:text-sm font-bold text-slate-200 hover:text-emerald-400 truncate cursor-pointer transition"
                          title={track.title}
                        >
                          {track.title}
                        </h4>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  {/* Lado Direito: Duração e Ações */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="text-xs font-mono text-slate-500 hidden md:inline mr-1">
                      {formatSeconds(track.durationSeconds)}
                    </span>

                    {/* BOTÃO REAL DE ADICIONAR / ALTERNAR NA FILA DE REPRODUÇÃO */}
                    <button
                      onClick={() => toggleQueue(playerTrack)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer border ${
                        isInQueue(track.id)
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40'
                          : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border-slate-700/60'
                      }`}
                      title={isInQueue(track.id) ? 'Na fila de reprodução (clique para remover)' : 'Adicionar à fila de reprodução (sem interromper a música atual)'}
                    >
                      {isInQueue(track.id) ? (
                        <>
                          <ListCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="hidden sm:inline">Na Fila</span>
                        </>
                      ) : (
                        <>
                          <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>+ Fila</span>
                        </>
                      )}
                    </button>

                    {/* BOTÃO ADICIONAR À PLAYLIST */}
                    <button
                      onClick={() => openAddToPlaylistModal(playerTrack)}
                      className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title="Salvar na playlist"
                    >
                      <Disc className="w-3.5 h-3.5" />
                    </button>

                    {/* BOTÃO FAVORITAR */}
                    <button
                      onClick={() => toggleFavorite(playerTrack)}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isFav
                          ? 'text-rose-500 bg-rose-500/10'
                          : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                      }`}
                      title={isFav ? 'Remover dos favoritos' : 'Favoritar'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>

                    {/* BOTÃO BAIXAR MP3 */}
                    <button
                      onClick={() =>
                        onOpenDownloadModal({
                          title: track.title,
                          artist: track.artist,
                          artwork: track.artwork || chartData.chartInfo.playlistCover,
                          durationSeconds: track.durationSeconds
                        })
                      }
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                      title="Baixar áudio MP3 completo do YouTube"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Baixar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
