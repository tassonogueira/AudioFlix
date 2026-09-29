import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Youtube,
  Music,
  Disc,
  User,
  Play,
  Pause,
  Download,
  Archive,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  X,
  Plus,
  Radio,
  Sliders,
  Check,
  CheckSquare,
  Square,
  Volume2,
  Clock,
  Eye,
  FolderPlus,
  Headphones,
  Heart,
  ListPlus
} from 'lucide-react';
import JSZip from 'jszip';
import { PlayerTrack } from './AudioFlixPlayer.tsx';
import DownloadFullTrackModal, { DownloadTrackInfo } from './DownloadFullTrackModal.tsx';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';

export interface YouTubeVideoResult {
  id: string;
  title: string;
  url: string;
  duration: string;
  seconds: number;
  author: string;
  thumbnail: string;
  image: string;
  views: number;
  ago: string;
}

export interface MusicArtist {
  id: number;
  name: string;
  genre: string;
}

export interface MusicAlbum {
  id: number | string;
  title: string;
  artist: string;
  artistId?: number;
  year: string;
  trackCount: number;
  artwork: string;
  genre?: string;
  copyright?: string;
  category?: 'live' | 'studio' | 'ep' | 'single';
  categoryLabel?: string;
  description?: string;
  highlightTracks?: string[];
  isStandalone?: boolean;
  previewUrl?: string;
  youtubeId?: string;
}

export interface MusicTrack {
  id: number;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  albumId?: number;
  durationSeconds: number;
  artwork: string;
  previewUrl?: string;
  youtubeId?: string;
}

export interface YouTubeMusicDownloaderProps {
  onAddTracksToQueue?: (tracks: Array<{ name: string; url?: string; blob?: Blob }>) => void;
  onSwitchToLocalWorkflow?: () => void;
  onPlayFullTrack?: (track: PlayerTrack, playlist?: PlayerTrack[]) => void;
  activePlayingTrackId?: string | number | null;
  isPlayingFullTrack?: boolean;
  onOpenDownloadModal?: (track: DownloadTrackInfo) => void;
  initialSearchQuery?: string;
}

export default function YouTubeMusicDownloader({
  onAddTracksToQueue,
  onSwitchToLocalWorkflow,
  onPlayFullTrack,
  activePlayingTrackId,
  isPlayingFullTrack = true,
  onOpenDownloadModal,
  initialSearchQuery
}: YouTubeMusicDownloaderProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [activeTab, setActiveTab] = useState<'all' | 'youtube' | 'artists' | 'albums' | 'songs'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [localDownloadTrack, setLocalDownloadTrack] = useState<DownloadTrackInfo | null>(null);

  // Resultados das buscas
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideoResult[]>([]);
  const [artistsList, setArtistsList] = useState<MusicArtist[]>([]);
  const [albumsList, setAlbumsList] = useState<MusicAlbum[]>([]);
  const [songsList, setSongsList] = useState<MusicTrack[]>([]);

  // Visualização de Artista Selecionado
  const [selectedArtist, setSelectedArtist] = useState<{
    info: MusicArtist;
    albums: MusicAlbum[];
    discography?: {
      liveAlbums: MusicAlbum[];
      studioAlbums: MusicAlbum[];
      epsAndCompilations: MusicAlbum[];
      standaloneSingles: MusicAlbum[];
      allAlbums: MusicAlbum[];
      totalCounts: {
        live: number;
        studio: number;
        eps: number;
        singles: number;
        total: number;
      };
    };
    standaloneSingles: MusicAlbum[];
    topTracks: MusicTrack[];
  } | null>(null);
  const [loadingArtist, setLoadingArtist] = useState(false);
  const [artistCategoryFilter, setArtistCategoryFilter] = useState<'all' | 'live' | 'studio' | 'ep' | 'singles'>('all');
  const [selectedSingleIds, setSelectedSingleIds] = useState<Set<number | string>>(new Set());
  const [isZippingSingles, setIsZippingSingles] = useState(false);
  const [singlesZipProgress, setSinglesZipProgress] = useState(0);

  // Visualização de Álbum Selecionado
  const [selectedAlbum, setSelectedAlbum] = useState<{
    info: MusicAlbum;
    tracks: MusicTrack[];
  } | null>(null);
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [selectedAlbumTrackIds, setSelectedAlbumTrackIds] = useState<Set<number>>(new Set());

  // Player de Áudio Embutido para Pré-Escuta
  const [playingAudioId, setPlayingAudioId] = useState<string | number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Download do Álbum em ZIP
  const [isZippingAlbum, setIsZippingAlbum] = useState(false);
  const [albumZipProgress, setAlbumZipProgress] = useState(0);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  // Playlists e Favoritas Context
  const { isFavorite, toggleFavorite, openAddToPlaylistModal, addToQueue, addDownloadRecord } = usePlaylistContext();

  useEffect(() => {
    const audio = new Audio();
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const formatSeconds = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatViews = (views: number): string => {
    if (!views) return '';
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M visualizações`;
    if (views >= 1000) return `${(views / 1000).toFixed(0)} mil visualizações`;
    return `${views} visualizações`;
  };

  // Reproduzir ou Pausar prévia de áudio (fallback)
  const togglePlayPreview = (audioUrl: string | undefined, id: string | number) => {
    if (!audioUrl) {
      alert('Prévia de áudio não disponível para este item.');
      return;
    }

    if (!audioRef.current) return;

    if (playingAudioId === id) {
      audioRef.current.pause();
      setPlayingAudioId(null);
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play().then(() => {
        setPlayingAudioId(id);
      }).catch(err => {
        console.warn('Erro ao tocar prévia:', err);
        setPlayingAudioId(null);
      });
    }
  };

  // Reproduzir Música Completa (Sem cortes de 30 segundos)
  const handlePlayTrack = (
    track: {
      id: string | number;
      title: string;
      artist: string;
      album?: string;
      artwork?: string;
      durationSeconds?: number;
      previewUrl?: string;
      youtubeId?: string;
    },
    playlistContext?: Array<any>
  ) => {
    if (onPlayFullTrack) {
      const formattedPlaylist = playlistContext
        ? playlistContext.map((item) => ({
            id: item.id,
            title: item.title,
            artist: item.artist || item.author || 'Artista',
            album: item.album || selectedAlbum?.info.title,
            artwork: item.artwork || item.image || item.thumbnail,
            durationSeconds: item.durationSeconds || item.seconds,
            youtubeId: item.youtubeId || (typeof item.id === 'string' && item.id.length === 11 ? item.id : undefined),
            previewUrl: item.previewUrl
          }))
        : undefined;

      onPlayFullTrack(
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album || selectedAlbum?.info.title,
          artwork: track.artwork,
          durationSeconds: track.durationSeconds,
          youtubeId: track.youtubeId,
          previewUrl: track.previewUrl
        },
        formattedPlaylist
      );
    } else {
      togglePlayPreview(track.previewUrl, track.id);
    }
  };

  // Abrir Modal de Download da Música Completa
  const handleDownloadSingleTrack = (track: {
    id?: string | number;
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    durationSeconds?: number;
    previewUrl?: string;
    youtubeId?: string;
  }) => {
    const downloadInfo: DownloadTrackInfo = {
      title: track.title,
      artist: track.artist,
      album: track.album || selectedAlbum?.info.title,
      artwork: track.artwork,
      durationSeconds: track.durationSeconds,
      youtubeId: track.youtubeId,
      previewUrl: track.previewUrl
    };

    if (onOpenDownloadModal) {
      onOpenDownloadModal(downloadInfo);
    } else {
      setLocalDownloadTrack(downloadInfo);
    }
  };

  // Executar Busca Geral
  const handleSearch = async (queryToSearch?: string) => {
    const term = (queryToSearch !== undefined ? queryToSearch : searchQuery).trim();
    if (!term) return;

    setIsSearching(true);
    setSearchExecuted(true);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingAudioId(null);
    }

    try {
      // 1. Busca no YouTube (Vídeos)
      const ytPromise = fetch(`/api/youtube/search?q=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .catch(() => ({ results: [] }));

      // 2. Busca no Catálogo Musical (Músicas)
      const songsPromise = fetch(`/api/music/search?q=${encodeURIComponent(term)}&type=song`)
        .then(r => r.json())
        .catch(() => ({ results: [] }));

      // 3. Busca no Catálogo Musical (Artistas)
      const artistsPromise = fetch(`/api/music/search?q=${encodeURIComponent(term)}&type=artist`)
        .then(r => r.json())
        .catch(() => ({ results: [] }));

      // 4. Busca no Catálogo Musical (Álbuns)
      const albumsPromise = fetch(`/api/music/search?q=${encodeURIComponent(term)}&type=album`)
        .then(r => r.json())
        .catch(() => ({ results: [] }));

      const [ytRes, songsRes, artistsRes, albumsRes] = await Promise.all([
        ytPromise,
        songsPromise,
        artistsPromise,
        albumsPromise
      ]);

      setYoutubeVideos(ytRes.results || []);
      setSongsList(songsRes.results || []);
      setArtistsList(artistsRes.results || []);
      setAlbumsList(albumsRes.results || []);

      // Se for um link direto de YouTube, seleciona a aba YouTube
      if (ytRes.isDirectLink) {
        setActiveTab('youtube');
      } else {
        setActiveTab('all');
      }
    } catch (err) {
      console.error('Erro na pesquisa:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Abrir Perfil do Artista com Discografia Categorizada e Top Faixas
  const handleOpenArtist = async (artist: MusicArtist) => {
    setLoadingArtist(true);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedSingleIds(new Set());

    try {
      const resp = await fetch(`/api/music/artist/${artist.id}/albums`);
      const data = await resp.json();

      const discography = data.discography || {
        liveAlbums: (data.albums || []).filter((a: any) => a.category === 'live'),
        studioAlbums: (data.albums || []).filter((a: any) => a.category === 'studio'),
        epsAndCompilations: (data.albums || []).filter((a: any) => a.category === 'ep'),
        standaloneSingles: data.standaloneSingles || [],
        allAlbums: data.albums || [],
        totalCounts: {
          live: (data.albums || []).filter((a: any) => a.category === 'live').length,
          studio: (data.albums || []).filter((a: any) => a.category === 'studio').length,
          eps: (data.albums || []).filter((a: any) => a.category === 'ep').length,
          singles: (data.standaloneSingles || []).length,
          total: (data.albums || []).length
        }
      };

      const singles = data.standaloneSingles || discography.standaloneSingles || [];

      setSelectedArtist({
        info: data.artist || artist,
        albums: data.albums || discography.allAlbums || [],
        discography,
        standaloneSingles: singles,
        topTracks: data.topTracks || []
      });
      setArtistCategoryFilter('all');
      // Seleciona todos os singles por padrão para facilitar o download
      setSelectedSingleIds(new Set(singles.map((s: any) => s.id)));
    } catch (err) {
      console.error('Erro ao buscar discografia do artista:', err);
      alert('Não foi possível carregar a discografia deste artista.');
    } finally {
      setLoadingArtist(false);
    }
  };

  // Alternar seleção de single avulso
  const toggleSingleSelection = (singleId: number | string) => {
    setSelectedSingleIds(prev => {
      const next = new Set(prev);
      if (next.has(singleId)) {
        next.delete(singleId);
      } else {
        next.add(singleId);
      }
      return next;
    });
  };

  // Selecionar / Desmarcar todos os singles avulsos
  const toggleSelectAllSingles = () => {
    if (!selectedArtist) return;
    const singles = selectedArtist.standaloneSingles || [];
    if (selectedSingleIds.size === singles.length) {
      setSelectedSingleIds(new Set());
    } else {
      setSelectedSingleIds(new Set(singles.map(s => s.id)));
    }
  };

  // Download de Músicas Avulsas Selecionadas em ZIP
  const handleDownloadSinglesBatchAsZip = async () => {
    if (!selectedArtist || selectedSingleIds.size === 0) {
      alert('Selecione ao menos uma música avulsa para baixar.');
      return;
    }

    const singlesToDownload = (selectedArtist.standaloneSingles || []).filter(s => selectedSingleIds.has(s.id));
    if (singlesToDownload.length === 0) return;

    setIsZippingSingles(true);
    setSinglesZipProgress(10);

    try {
      const zip = new JSZip();
      const folderName = `${selectedArtist.info.name} - Musicas_Avulsas_e_Singles`;
      const folder = zip.folder(folderName) || zip;

      let completed = 0;
      for (const single of singlesToDownload) {
        const fileName = `${single.artist} - ${single.title}.mp3`;

        try {
          // Busca o áudio 100% completo pela API interna
          const fullAudioResp = await fetch(
            `/api/music/download-full-track?artist=${encodeURIComponent(single.artist)}&title=${encodeURIComponent(single.title)}`
          );
          if (fullAudioResp.ok) {
            const audioBlob = await fullAudioResp.blob();
            folder.file(fileName, audioBlob);
          } else {
            folder.file(fileName, new Blob([single.title], { type: 'audio/mpeg' }));
          }
        } catch {
          folder.file(fileName, new Blob([single.title], { type: 'audio/mpeg' }));
        }

        completed++;
        setSinglesZipProgress(Math.round((completed / singlesToDownload.length) * 80) + 10);
      }

      setSinglesZipProgress(95);
      const zipContent = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedArtist.info.name} - Musicas_Avulsas_e_Singles.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 25000);

      addDownloadRecord({
        title: `${selectedArtist.info.name} - Músicas Avulsas`,
        artist: selectedArtist.info.name,
        type: 'singles_zip',
        fileSizeStr: `${singlesToDownload.length} faixas • ZIP`,
        fileName: `${selectedArtist.info.name} - Musicas_Avulsas_e_Singles.zip`
      });

      setDownloadSuccessToast(`${singlesToDownload.length} músicas avulsas baixadas com sucesso em ZIP!`);
      setTimeout(() => setDownloadSuccessToast(null), 6000);
    } catch (err) {
      console.error('Erro ao gerar ZIP de músicas avulsas:', err);
      alert('Erro ao gerar ZIP de músicas avulsas: ' + String(err));
    } finally {
      setIsZippingSingles(false);
      setSinglesZipProgress(0);
    }
  };

  // Abrir Detalhes do Álbum com Todas as Faixas Numeradas
  const handleOpenAlbum = async (album: MusicAlbum) => {
    setLoadingAlbum(true);
    setSelectedAlbum(null);

    try {
      const resp = await fetch(`/api/music/album/${album.id}/tracks`);
      const data = await resp.json();

      const tracks: MusicTrack[] = data.tracks || [];
      setSelectedAlbum({
        info: data.album || album,
        tracks
      });

      // Seleciona todas as faixas por padrão
      setSelectedAlbumTrackIds(new Set(tracks.map(t => t.id)));
    } catch (err) {
      console.error('Erro ao carregar faixas do álbum:', err);
      alert('Não foi possível carregar as faixas deste álbum.');
    } finally {
      setLoadingAlbum(false);
    }
  };

  // Alternar seleção de faixa no álbum
  const toggleAlbumTrackSelection = (trackId: number) => {
    setSelectedAlbumTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  // Selecionar / Desmarcar todas as faixas do álbum
  const toggleSelectAllAlbumTracks = () => {
    if (!selectedAlbum) return;
    if (selectedAlbumTrackIds.size === selectedAlbum.tracks.length) {
      setSelectedAlbumTrackIds(new Set());
    } else {
      setSelectedAlbumTrackIds(new Set(selectedAlbum.tracks.map(t => t.id)));
    }
  };

  // Download do Álbum Completo em ZIP
  const handleDownloadFullAlbumAsZip = async () => {
    if (!selectedAlbum || selectedAlbum.tracks.length === 0) return;

    const tracksToDownload = selectedAlbum.tracks.filter(t => selectedAlbumTrackIds.has(t.id));
    if (tracksToDownload.length === 0) {
      alert('Nenhuma faixa selecionada para baixar.');
      return;
    }

    setIsZippingAlbum(true);
    setAlbumZipProgress(5);

    try {
      const zip = new JSZip();
      const folderName = `${selectedAlbum.info.artist} - ${selectedAlbum.info.title} (${selectedAlbum.info.year || 'Álbum'})`;
      const albumFolder = zip.folder(folderName) || zip;

      // 1. Tenta adicionar a capa do álbum em alta resolução dentro do ZIP
      if (selectedAlbum.info.artwork) {
        try {
          const coverResp = await fetch(selectedAlbum.info.artwork);
          if (coverResp.ok) {
            const coverBlob = await coverResp.blob();
            albumFolder.file('cover.jpg', coverBlob);
          }
        } catch {
          // Ignora se a imagem não carregar por CORS
        }
      }

      // 2. Baixa e empacota cada faixa selecionada
      let completedCount = 0;
      for (const track of tracksToDownload) {
        const trackNumberStr = track.trackNumber < 10 ? `0${track.trackNumber}` : `${track.trackNumber}`;
        const fileName = `${trackNumberStr} - ${track.title}.mp3`;

        try {
          // Busca o áudio 100% completo pela API interna (sem corte de 30s)
          const fullAudioResp = await fetch(
            `/api/music/download-full-track?artist=${encodeURIComponent(track.artist || selectedAlbum.info.artist)}&title=${encodeURIComponent(track.title)}`
          );
          if (fullAudioResp.ok) {
            const audioBlob = await fullAudioResp.blob();
            albumFolder.file(fileName, audioBlob);
          } else if (track.previewUrl) {
            const audioResp = await fetch(track.previewUrl);
            const audioBlob = await audioResp.blob();
            albumFolder.file(fileName, audioBlob);
          } else {
            albumFolder.file(fileName, new Blob([track.title], { type: 'audio/mpeg' }));
          }
        } catch {
          albumFolder.file(fileName, new Blob([track.title], { type: 'audio/mpeg' }));
        }

        completedCount++;
        setAlbumZipProgress(Math.round((completedCount / tracksToDownload.length) * 80) + 5);
      }

      setAlbumZipProgress(90);

      // 3. Gera o arquivo ZIP com compressão STORE rápida
      const zipContent = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE'
      }, (meta) => {
        setAlbumZipProgress(90 + Math.round(meta.percent * 0.1));
      });

      const zipUrl = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `${selectedAlbum.info.artist} - ${selectedAlbum.info.title}_[Álbum_Completo].zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);

      addDownloadRecord({
        title: selectedAlbum.info.title,
        artist: selectedAlbum.info.artist,
        album: selectedAlbum.info.title,
        artwork: selectedAlbum.info.artwork,
        type: 'album_zip',
        fileSizeStr: `${tracksToDownload.length} faixas • ZIP`,
        fileName: `${selectedAlbum.info.artist} - ${selectedAlbum.info.title}_[Álbum_Completo].zip`
      });

      setDownloadSuccessToast(`Álbum "${selectedAlbum.info.title}" (${tracksToDownload.length} músicas) baixado com sucesso em ZIP!`);
      setTimeout(() => setDownloadSuccessToast(null), 7000);
    } catch (err) {
      console.error('Erro ao gerar ZIP do álbum:', err);
      alert('Falha ao empacotar o álbum em ZIP: ' + String(err));
    } finally {
      setIsZippingAlbum(false);
      setAlbumZipProgress(0);
    }
  };

  // Abrir no reprodutor AudioFlix com Segundo Plano e PiP sem abrir abas externas
  const handleOpenYouTubeVideo = (video: YouTubeVideoResult) => {
    handlePlayTrack(
      {
        id: video.id,
        title: video.title,
        artist: video.author,
        artwork: video.image || video.thumbnail,
        durationSeconds: video.seconds,
        youtubeId: video.id
      },
      youtubeVideos
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* TOAST DE SUCESSO DE DOWNLOAD */}
      {downloadSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/40">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">{downloadSuccessToast}</span>
            <button
              onClick={() => setDownloadSuccessToast(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* SEÇÃO 1: BARRA DE BUSCA PRINCIPAL (PÁGINA INICIAL ENXUTA) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="max-w-3xl mx-auto text-center space-y-2 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Youtube className="w-3.5 h-3.5 text-red-500" />
            <span>Downloader & Catálogo Musical Inteligente</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Busque Músicas, Artistas ou Cole Links do YouTube
          </h2>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Pesquise por nome de artista para ver discografias com capas originais, explore álbuns completos e baixe faixas avulsas ou álbuns inteiros em arquivo ZIP (.mp3).
          </p>
        </div>

        {/* Campo de Busca Grande e Limpo */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="max-w-3xl mx-auto"
        >
          <div className="relative flex items-center">
            <div className="absolute left-4 text-slate-400 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-emerald-400" />
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cole um link do YouTube ou digite Artista, Música ou Álbum..."
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl pl-12 pr-32 py-4 text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none shadow-inner transition"
            />

            <div className="absolute right-2.5 flex items-center gap-1.5">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition flex items-center gap-2 shadow-md shadow-emerald-950/40"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <span>Buscar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Sugestões Rápidas de Artistas e Músicas */}
        <div className="max-w-3xl mx-auto flex items-center justify-center flex-wrap gap-2 pt-2">
          <span className="text-xs text-slate-500 font-medium">Exemplos rápidos:</span>
          {[
            'Jorge & Mateus',
            'Henrique & Juliano',
            'Gusttavo Lima',
            'Marília Mendonça',
            'Coldplay',
            'Queen',
            'Legião Urbana',
            'Evidências'
          ].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setSearchQuery(tag);
                handleSearch(tag);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* SEÇÃO 2: DETALHES DO ÁLBUM SELECIONADO (COM CAPA GRANDE E DOWNLOAD DO ZIP) */}
      {selectedAlbum && (
        <div className="bg-slate-900/90 border-2 border-emerald-500/40 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedAlbum(null)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar aos resultados</span>
            </button>

            <span className="text-xs text-emerald-400 font-mono font-bold uppercase tracking-wider">
              Álbum Completo
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Capa em Alta Resolução */}
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-slate-950 shrink-0 relative group">
              <img
                src={selectedAlbum.info.artwork}
                alt={selectedAlbum.info.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
              <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white font-mono">
                {selectedAlbum.info.year} • {selectedAlbum.tracks.length} faixas
              </span>
            </div>

            {/* Informações e Botão de Download do Álbum Completo */}
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1.5">
                  <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                    {selectedAlbum.info.artist}
                  </span>
                  {selectedAlbum.info.categoryLabel && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      selectedAlbum.info.category === 'live'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : selectedAlbum.info.category === 'studio'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : selectedAlbum.info.category === 'ep'
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    }`}>
                      {selectedAlbum.info.categoryLabel}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {selectedAlbum.info.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedAlbum.info.genre || 'Álbum'} • Lançamento: {selectedAlbum.info.year} • {selectedAlbum.tracks.length} músicas oficiais que fazem parte deste álbum
                </p>

                {selectedAlbum.info.description && (
                  <p className="text-xs text-slate-300 mt-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800 leading-relaxed text-left">
                    💡 {selectedAlbum.info.description}
                  </p>
                )}
              </div>

              {/* Botão de Destaque: Baixar Álbum Completo em ZIP */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleDownloadFullAlbumAsZip}
                  disabled={isZippingAlbum || selectedAlbumTrackIds.size === 0}
                  className="w-full sm:w-auto px-7 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-sm font-bold rounded-xl shadow-xl shadow-emerald-950/50 transition flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                >
                  {isZippingAlbum ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Gerando ZIP do Álbum ({albumZipProgress}%)...</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-5 h-5" />
                      <span>Baixar Álbum Completo em ZIP ({selectedAlbumTrackIds.size} faixas)</span>
                    </>
                  )}
                </button>

                <button
                  onClick={toggleSelectAllAlbumTracks}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  {selectedAlbumTrackIds.size === selectedAlbum.tracks.length
                    ? 'Desmarcar Todas'
                    : 'Selecionar Todas as Faixas'}
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Faixas do Álbum */}
          <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-950/50">
            <div className="p-3 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
              <span>Faixas do Disco</span>
              <span>{selectedAlbumTrackIds.size} de {selectedAlbum.tracks.length} selecionadas</span>
            </div>

            {selectedAlbum.tracks.map((track) => {
              const isSelected = selectedAlbumTrackIds.has(track.id);
              const isPlaying = (activePlayingTrackId === track.id || playingAudioId === track.id) && isPlayingFullTrack;

              return (
                <div
                  key={track.id}
                  className={`p-3.5 flex items-center justify-between gap-3 transition ${
                    isSelected ? 'hover:bg-slate-800/30' : 'opacity-40 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAlbumTrackSelection(track.id)}
                      className="rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 border-slate-700 cursor-pointer"
                    />

                    <span className="text-xs font-mono text-slate-500 w-6 text-right shrink-0">
                      {track.trackNumber < 10 ? `0${track.trackNumber}` : track.trackNumber}
                    </span>

                    <button
                      onClick={() => handlePlayTrack(track, selectedAlbum.tracks)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                        isPlaying
                          ? 'bg-emerald-500 text-slate-950 shadow-md animate-pulse'
                          : 'bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300'
                      }`}
                      title={isPlaying ? 'Música tocando (100% completa)' : 'Ouvir música completa (sem 30s)'}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    <div className="truncate">
                      <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate" title={track.title}>
                        {track.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        {track.artist}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                      {formatSeconds(track.durationSeconds)}
                    </span>

                    <button
                      onClick={() =>
                        toggleFavorite({
                          id: track.id,
                          title: track.title,
                          artist: track.artist,
                          album: selectedAlbum.info.title,
                          artwork: selectedAlbum.info.artwork,
                          durationSeconds: track.durationSeconds,
                          previewUrl: track.previewUrl
                        })
                      }
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isFavorite(track.id)
                          ? 'text-rose-500 bg-rose-500/10'
                          : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                      }`}
                      title={isFavorite(track.id) ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFavorite(track.id) ? 'fill-current' : ''}`} />
                    </button>

                    <button
                      onClick={() =>
                        openAddToPlaylistModal({
                          id: track.id,
                          title: track.title,
                          artist: track.artist,
                          album: selectedAlbum.info.title,
                          artwork: selectedAlbum.info.artwork,
                          durationSeconds: track.durationSeconds,
                          previewUrl: track.previewUrl
                        })
                      }
                      className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title="Adicionar à Playlist"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDownloadSingleTrack(track)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 hover:border-emerald-500 cursor-pointer"
                      title="Baixar esta faixa completa em MP3"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Baixar MP3</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SEÇÃO 3: PERFIL DO ARTISTA SELECIONADO (DISCOGRAFIA COMPLETA E CATEGORIZADA) */}
      {selectedArtist && !selectedAlbum && (() => {
        const liveAlbums = selectedArtist.discography?.liveAlbums || selectedArtist.albums.filter(a => a.category === 'live');
        const studioAlbums = selectedArtist.discography?.studioAlbums || selectedArtist.albums.filter(a => a.category === 'studio');
        const epsAndCompilations = selectedArtist.discography?.epsAndCompilations || selectedArtist.albums.filter(a => a.category === 'ep');
        const standaloneSingles = selectedArtist.standaloneSingles || selectedArtist.discography?.standaloneSingles || [];
        const totalAlbumsCount = liveAlbums.length + studioAlbums.length + epsAndCompilations.length;

        return (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-200">
            {/* Top Navigation & Status */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedArtist(null)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar aos resultados da busca</span>
              </button>

              <span className="text-xs text-emerald-400 font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Discografia Completa Organizada</span>
              </span>
            </div>

            {/* Cabeçalho do Artista com Estatísticas */}
            <div className="border-b border-slate-800 pb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {selectedArtist.info.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Gênero: <span className="text-slate-300 font-medium">{selectedArtist.info.genre}</span> • Discografia organizada em ordem cronológica com todos os álbuns e faixas avulsas.
                  </p>
                </div>

                {/* Resumo de Contagem */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                    💿 {liveAlbums.length} Ao Vivo / DVDs
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold">
                    🎙️ {studioAlbums.length} Estúdio
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 font-semibold">
                    🎵 {epsAndCompilations.length} EPs / Coletâneas
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold">
                    ⚡ {standaloneSingles.length} Músicas Avulsas
                  </span>
                </div>
              </div>

              {/* Botões de Filtro Rápido de Discografia */}
              <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'Todos os Lançamentos', count: totalAlbumsCount + standaloneSingles.length },
                  { id: 'live', label: '💿 Álbuns Ao Vivo e DVDs', count: liveAlbums.length },
                  { id: 'studio', label: '🎙️ Álbuns de Estúdio', count: studioAlbums.length },
                  { id: 'ep', label: '🎵 EPs e Coletâneas', count: epsAndCompilations.length },
                  { id: 'singles', label: '⚡ Músicas Avulsas & Singles', count: standaloneSingles.length }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setArtistCategoryFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                      artistCategoryFilter === f.id
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      artistCategoryFilter === f.id ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* SEÇÃO 1: ÁLBUNS AO VIVO E DVDS */}
            {(artistCategoryFilter === 'all' || artistCategoryFilter === 'live') && liveAlbums.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Disc className="w-5 h-5 text-amber-400" />
                      <span>Álbuns Ao Vivo e DVDs ({liveAlbums.length})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Os álbuns ao vivo e registros em DVD concentram a maior parte dos grandes sucessos históricos e músicas lado B gravadas ao longo da carreira.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveAlbums.map((album) => (
                    <div
                      key={album.id}
                      onClick={() => handleOpenAlbum(album)}
                      className="bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 rounded-xl p-4 cursor-pointer group transition flex flex-col justify-between hover:shadow-xl space-y-3"
                    >
                      <div className="flex gap-3.5">
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative group-hover:scale-105 transition duration-300 border border-slate-800">
                          <img
                            src={album.artwork}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Ao Vivo & DVD
                          </span>
                          <h5 className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-amber-400 transition truncate" title={album.title}>
                            {album.title}
                          </h5>
                          <span className="text-[11px] text-slate-400 block">
                            Ano: <strong className="text-slate-300">{album.year}</strong> • {album.trackCount} faixas
                          </span>
                        </div>
                      </div>

                      {album.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                          {album.description}
                        </p>
                      )}

                      {album.highlightTracks && album.highlightTracks.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                            Músicas em destaque:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {album.highlightTracks.slice(0, 4).map((hit, idx) => (
                              <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                                {hit}
                              </span>
                            ))}
                            {album.highlightTracks.length > 4 && (
                              <span className="text-[10px] text-slate-500 self-center">
                                +{album.highlightTracks.length - 4} faixas
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="w-full py-2 bg-slate-900 group-hover:bg-amber-600 group-hover:text-slate-950 font-bold text-slate-200 text-xs rounded-lg transition flex items-center justify-center gap-1.5 border border-slate-800 group-hover:border-amber-500"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Ver Faixas & Baixar Álbum em ZIP</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO 2: ÁLBUNS DE ESTÚDIO */}
            {(artistCategoryFilter === 'all' || artistCategoryFilter === 'studio') && studioAlbums.length > 0 && (
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Music className="w-5 h-5 text-emerald-400" />
                      <span>Álbuns de Estúdio ({studioAlbums.length})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Trabalhos totalmente gravados e produzidos em estúdio, com foco em arranjos detalhados e conceitos musicais profundos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {studioAlbums.map((album) => (
                    <div
                      key={album.id}
                      onClick={() => handleOpenAlbum(album)}
                      className="bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 cursor-pointer group transition flex flex-col justify-between hover:shadow-xl space-y-3"
                    >
                      <div className="flex gap-3.5">
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative group-hover:scale-105 transition duration-300 border border-slate-800">
                          <img
                            src={album.artwork}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Álbum de Estúdio
                          </span>
                          <h5 className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition truncate" title={album.title}>
                            {album.title}
                          </h5>
                          <span className="text-[11px] text-slate-400 block">
                            Ano: <strong className="text-slate-300">{album.year}</strong> • {album.trackCount} faixas
                          </span>
                        </div>
                      </div>

                      {album.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                          {album.description}
                        </p>
                      )}

                      {album.highlightTracks && album.highlightTracks.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">
                            Músicas em destaque:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {album.highlightTracks.slice(0, 4).map((hit, idx) => (
                              <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                                {hit}
                              </span>
                            ))}
                            {album.highlightTracks.length > 4 && (
                              <span className="text-[10px] text-slate-500 self-center">
                                +{album.highlightTracks.length - 4} faixas
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="w-full py-2 bg-slate-900 group-hover:bg-emerald-600 group-hover:text-white font-bold text-slate-200 text-xs rounded-lg transition flex items-center justify-center gap-1.5 border border-slate-800 group-hover:border-emerald-500"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Ver Faixas & Baixar Álbum em ZIP</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO 3: EPS E COLETÂNEAS */}
            {(artistCategoryFilter === 'all' || artistCategoryFilter === 'ep') && epsAndCompilations.length > 0 && (
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Radio className="w-5 h-5 text-blue-400" />
                      <span>EPs, Coletâneas e Projetos Especiais ({epsAndCompilations.length})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Formatos temáticos (como o Jorge & Mateus Elétrico no Carnaval de Salvador), EPs de transição e coletâneas comemorativas.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {epsAndCompilations.map((album) => (
                    <div
                      key={album.id}
                      onClick={() => handleOpenAlbum(album)}
                      className="bg-slate-950/70 border border-slate-800 hover:border-blue-500/50 rounded-xl p-4 cursor-pointer group transition flex flex-col justify-between hover:shadow-xl space-y-3"
                    >
                      <div className="flex gap-3.5">
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-900 shrink-0 relative group-hover:scale-105 transition duration-300 border border-slate-800">
                          <img
                            src={album.artwork}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {album.categoryLabel || 'EP & Especial'}
                          </span>
                          <h5 className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-blue-400 transition truncate" title={album.title}>
                            {album.title}
                          </h5>
                          <span className="text-[11px] text-slate-400 block">
                            Ano: <strong className="text-slate-300">{album.year}</strong> • {album.trackCount} faixas
                          </span>
                        </div>
                      </div>

                      {album.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-slate-850">
                          {album.description}
                        </p>
                      )}

                      <button
                        type="button"
                        className="w-full py-2 bg-slate-900 group-hover:bg-blue-600 group-hover:text-white font-bold text-slate-200 text-xs rounded-lg transition flex items-center justify-center gap-1.5 border border-slate-800 group-hover:border-blue-500"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Ver Faixas & Baixar Álbum em ZIP</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO 4: MÚSICAS AVULSAS, SINGLES DE TRANSIÇÃO E RECENTES */}
            {(artistCategoryFilter === 'all' || artistCategoryFilter === 'singles') && standaloneSingles.length > 0 && (
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                      <span>Músicas Avulsas & Singles Relevantes ({standaloneSingles.length})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Músicas lançadas avulsas nas plataformas digitais, singles de transição e parcerias com outros artistas que não integram álbuns cheios.
                    </p>
                  </div>

                  {/* Ação em lote para baixar as músicas avulsas em ZIP */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={toggleSelectAllSingles}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700"
                    >
                      {selectedSingleIds.size === standaloneSingles.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                    </button>

                    <button
                      onClick={handleDownloadSinglesBatchAsZip}
                      disabled={isZippingSingles || selectedSingleIds.size === 0}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-purple-950/40"
                    >
                      {isZippingSingles ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Baixando ({singlesZipProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <Archive className="w-3.5 h-3.5" />
                          <span>Baixar Selecionadas em ZIP ({selectedSingleIds.size})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {standaloneSingles.map((single) => {
                    const isSelected = selectedSingleIds.has(single.id);

                    return (
                      <div
                        key={single.id}
                        className={`p-3 bg-slate-950/70 border rounded-xl flex items-center justify-between gap-3 transition ${
                          isSelected ? 'border-purple-500/50 bg-slate-950/90' : 'border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSingleSelection(single.id)}
                            className="rounded text-purple-500 focus:ring-purple-500/20 bg-slate-900 border-slate-700 cursor-pointer shrink-0"
                          />

                          <img
                            src={single.artwork}
                            alt={single.title}
                            className="w-12 h-12 rounded-lg object-cover bg-slate-800 shrink-0 border border-slate-800"
                          />

                          <div className="truncate">
                            <span className="text-xs font-bold text-slate-200 block truncate" title={single.title}>
                              {single.title}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-semibold">
                                {single.categoryLabel || 'Música Avulsa'}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {single.year}
                              </span>
                            </div>
                            {single.description && (
                              <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                                {single.description}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              toggleFavorite({
                                id: single.id,
                                title: single.title,
                                artist: single.artist,
                                album: single.title,
                                artwork: single.artwork,
                                previewUrl: single.previewUrl
                              })
                            }
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isFavorite(single.id)
                                ? 'text-rose-500 bg-rose-500/10'
                                : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                            }`}
                            title={isFavorite(single.id) ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFavorite(single.id) ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            onClick={() =>
                              openAddToPlaylistModal({
                                id: single.id,
                                title: single.title,
                                artist: single.artist,
                                album: single.title,
                                artwork: single.artwork,
                                previewUrl: single.previewUrl
                              })
                            }
                            className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Adicionar à Playlist"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              handlePlayTrack(single, standaloneSingles);
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                              (activePlayingTrackId === single.id || playingAudioId === single.id) && isPlayingFullTrack
                                ? 'bg-purple-500 text-slate-950 shadow-md animate-pulse'
                                : 'bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-300'
                            }`}
                            title="Ouvir música avulsa completa (sem 30s)"
                          >
                            {(activePlayingTrackId === single.id || playingAudioId === single.id) && isPlayingFullTrack ? (
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            )}
                          </button>

                          <button
                            onClick={() => {
                              handleDownloadSingleTrack(single);
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-300 rounded-lg transition border border-slate-700 hover:border-purple-500 cursor-pointer"
                            title="Baixar MP3 da música avulsa completa"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO 5: PRINCIPAIS MÚSICAS DO ARTISTA (VISÃO GERAL) */}
            {artistCategoryFilter === 'all' && selectedArtist.topTracks.length > 0 && (
              <div className="space-y-3 pt-6 border-t border-slate-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Music className="w-4 h-4 text-emerald-400" />
                  <span>Músicas Mais Populares de {selectedArtist.info.name}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedArtist.topTracks.slice(0, 8).map((track) => (
                    <div
                      key={track.id}
                      className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={track.artwork}
                          alt={track.title}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0"
                        />
                        <div className="truncate">
                          <span className="text-xs font-semibold text-slate-200 block truncate">
                            {track.title}
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {track.album}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            toggleFavorite({
                              id: track.id,
                              title: track.title,
                              artist: track.artist,
                              album: track.album,
                              artwork: track.artwork,
                              durationSeconds: track.durationSeconds,
                              previewUrl: track.previewUrl
                            })
                          }
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isFavorite(track.id)
                              ? 'text-rose-500 bg-rose-500/10'
                              : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                          }`}
                          title={isFavorite(track.id) ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isFavorite(track.id) ? 'fill-current' : ''}`} />
                        </button>

                        <button
                          onClick={() =>
                            openAddToPlaylistModal({
                              id: track.id,
                              title: track.title,
                              artist: track.artist,
                              album: track.album,
                              artwork: track.artwork,
                              durationSeconds: track.durationSeconds,
                              previewUrl: track.previewUrl
                            })
                          }
                          className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Adicionar à Playlist"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handlePlayTrack(track, selectedArtist.topTracks)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                            (activePlayingTrackId === track.id || playingAudioId === track.id) && isPlayingFullTrack
                              ? 'bg-emerald-500 text-slate-950 shadow-md animate-pulse'
                              : 'bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300'
                          }`}
                          title="Ouvir música completa (sem 30s)"
                        >
                          {(activePlayingTrackId === track.id || playingAudioId === track.id) && isPlayingFullTrack ? (
                            <Pause className="w-3 h-3 fill-current" />
                          ) : (
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDownloadSingleTrack(track)}
                          className="p-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg transition cursor-pointer"
                          title="Baixar MP3 completo"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* SEÇÃO 4: ABAS E RESULTADOS DA PESQUISA */}
      {searchExecuted && !selectedAlbum && !selectedArtist && (
        <div className="space-y-4">
          
          {/* Abas com Contadores */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
            {[
              { id: 'all', label: 'Tudo', count: youtubeVideos.length + artistsList.length + albumsList.length + songsList.length },
              { id: 'youtube', label: 'Vídeos do YouTube', count: youtubeVideos.length, icon: Youtube },
              { id: 'artists', label: 'Artistas', count: artistsList.length, icon: User },
              { id: 'albums', label: 'Álbuns Completos', count: albumsList.length, icon: Disc },
              { id: 'songs', label: 'Faixas & Músicas', count: songsList.length, icon: Music }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === tab.id ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* VÍDEOS DO YOUTUBE */}
          {(activeTab === 'all' || activeTab === 'youtube') && youtubeVideos.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  <span>Vídeos do YouTube ({youtubeVideos.length} resultados)</span>
                </h3>
                <span className="text-xs text-slate-400">Clique para baixar ou ouvir</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {youtubeVideos.map((video) => (
                  <div
                    key={video.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition flex flex-col justify-between group"
                  >
                    <div>
                      {/* Thumbnail com tempo de duração */}
                      <div className="aspect-video relative overflow-hidden bg-slate-900">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono text-white font-semibold">
                          {video.duration}
                        </div>
                      </div>

                      <div className="p-3.5 space-y-1">
                        <h4
                          className="text-xs font-bold text-slate-200 line-clamp-2 group-hover:text-emerald-400 transition"
                          title={video.title}
                        >
                          {video.title}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span className="truncate max-w-[140px]">{video.author}</span>
                          <span>{video.ago || formatViews(video.views)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 pt-0 border-t border-slate-800/60 mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            toggleFavorite({
                              id: video.id,
                              title: video.title,
                              artist: video.author,
                              artwork: video.image || video.thumbnail,
                              durationSeconds: video.seconds,
                              youtubeId: video.id
                            })
                          }
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isFavorite(video.id)
                              ? 'text-rose-500 bg-rose-500/10'
                              : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                          }`}
                          title={isFavorite(video.id) ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isFavorite(video.id) ? 'fill-current' : ''}`} />
                        </button>

                        <button
                          onClick={() =>
                            openAddToPlaylistModal({
                              id: video.id,
                              title: video.title,
                              artist: video.author,
                              artwork: video.image || video.thumbnail,
                              durationSeconds: video.seconds,
                              youtubeId: video.id
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Adicionar à Playlist"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            handlePlayTrack(
                              {
                                id: video.id,
                                title: video.title,
                                artist: video.author,
                                artwork: video.image || video.thumbnail,
                                durationSeconds: video.seconds,
                                youtubeId: video.id
                              },
                              youtubeVideos
                            )
                          }
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                          title="Ouvir vídeo completo no player"
                        >
                          <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                          <span>Ouvir</span>
                        </button>

                        <button
                          onClick={() =>
                            handleDownloadSingleTrack({
                              id: video.id,
                              title: video.title,
                              artist: video.author,
                              artwork: video.image || video.thumbnail,
                              durationSeconds: video.seconds,
                              youtubeId: video.id
                            })
                          }
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                          title="Baixar áudio MP3 completo"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Baixar MP3</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ARTISTAS ENCONTRADOS */}
          {(activeTab === 'all' || activeTab === 'artists') && artistsList.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <span>Artistas ({artistsList.length} encontrados)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {artistsList.map((artist) => (
                  <div
                    key={artist.id}
                    onClick={() => handleOpenArtist(artist)}
                    className="p-3.5 bg-slate-950/70 border border-slate-800 hover:border-emerald-500/60 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-sm">
                        {artist.name.charAt(0)}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition block truncate">
                          {artist.name}
                        </span>
                        <span className="text-[11px] text-slate-400 block truncate">
                          {artist.genre}
                        </span>
                      </div>
                    </div>

                    <span className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-300 font-semibold shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                      Ver Álbuns ➔
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ÁLBUNS ENCONTRADOS */}
          {(activeTab === 'all' || activeTab === 'albums') && albumsList.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Disc className="w-4 h-4 text-emerald-400" />
                <span>Álbuns ({albumsList.length} encontrados)</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {albumsList.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => handleOpenAlbum(album)}
                    className="bg-slate-950/70 border border-slate-800 hover:border-emerald-500/60 rounded-xl p-3 cursor-pointer group transition flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="aspect-square rounded-lg overflow-hidden bg-slate-800 relative">
                        <img
                          src={album.artwork}
                          alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-emerald-400 transition" title={album.title}>
                          {album.title}
                        </h4>
                        <span className="text-[11px] text-slate-400 block truncate">
                          {album.artist}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {album.year} • {album.trackCount} músicas
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mt-2.5 w-full py-1.5 bg-slate-800 group-hover:bg-emerald-600 group-hover:text-white text-slate-300 text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1"
                    >
                      <Archive className="w-3 h-3" />
                      <span>Baixar Álbum</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MÚSICAS ENCONTRADAS */}
          {(activeTab === 'all' || activeTab === 'songs') && songsList.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Music className="w-4 h-4 text-emerald-400" />
                <span>Músicas & Faixas Oficiais ({songsList.length} encontradas)</span>
              </h3>

              <div className="divide-y divide-slate-800/60 border border-slate-800 rounded-xl bg-slate-950/50 overflow-hidden">
                {songsList.map((song) => {
                  const isPlaying = playingAudioId === song.id;

                  return (
                    <div
                      key={song.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={song.artwork}
                          alt={song.title}
                          className="w-11 h-11 rounded-lg object-cover bg-slate-800 shrink-0"
                        />

                        <button
                          onClick={() => handlePlayTrack(song, songsList)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition shrink-0 cursor-pointer ${
                            (activePlayingTrackId === song.id || playingAudioId === song.id) && isPlayingFullTrack
                              ? 'bg-emerald-500 text-slate-950 shadow-md animate-pulse'
                              : 'bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300'
                          }`}
                          title="Ouvir música completa (sem 30s)"
                        >
                          {(activePlayingTrackId === song.id || playingAudioId === song.id) && isPlayingFullTrack ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="truncate">
                          <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate" title={song.title}>
                            {song.title}
                          </span>
                          <span className="text-[11px] text-slate-400 block truncate">
                            {song.artist} • <span className="text-slate-500">{song.album}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="text-xs font-mono text-slate-500 hidden sm:inline">
                          {formatSeconds(song.durationSeconds)}
                        </span>

                        <button
                          onClick={() =>
                            toggleFavorite({
                              id: song.id,
                              title: song.title,
                              artist: song.artist,
                              album: song.album,
                              artwork: song.artwork,
                              durationSeconds: song.durationSeconds,
                              previewUrl: song.previewUrl
                            })
                          }
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isFavorite(song.id)
                              ? 'text-rose-500 bg-rose-500/10'
                              : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                          }`}
                          title={isFavorite(song.id) ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isFavorite(song.id) ? 'fill-current' : ''}`} />
                        </button>

                        <button
                          onClick={() =>
                            openAddToPlaylistModal({
                              id: song.id,
                              title: song.title,
                              artist: song.artist,
                              album: song.album,
                              artwork: song.artwork,
                              durationSeconds: song.durationSeconds,
                              previewUrl: song.previewUrl
                            })
                          }
                          className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Adicionar à Playlist"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDownloadSingleTrack(song)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                          title="Baixar MP3 completo"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Baixar MP3</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODAL DE DOWNLOAD DE MÚSICA COMPLETA */}
      {localDownloadTrack && (
        <DownloadFullTrackModal
          track={localDownloadTrack}
          onClose={() => setLocalDownloadTrack(null)}
          onAddToLocalRepair={onAddTracksToQueue ? (file) => onAddTracksToQueue([file]) : undefined}
        />
      )}

    </div>
  );
}
