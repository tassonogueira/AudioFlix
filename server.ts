import express from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import yts from 'yt-search';
import {
  classifyReleases,
  JORGE_E_MATEUS_CANONICAL,
  ClassifiedAlbum
} from './src/utils/discographyData.ts';

const execFilePromise = promisify(execFile);
const ytDlpPath = path.resolve(process.cwd(), 'bin/yt-dlp');

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper para extrair Video ID do YouTube a partir de qualquer formato de URL
function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  
  // Se for apenas o ID (11 caracteres alfanuméricos/hífens)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Links do tipo https://youtu.be/ID ou https://youtube.com/watch?v=ID ou shorts
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('?')[0];
      if (id && id.length === 11) return id;
    }
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && v.length === 11) return v;
      if (url.pathname.includes('/shorts/')) {
        const id = url.pathname.split('/shorts/')[1]?.split('?')[0];
        if (id && id.length === 11) return id;
      }
    }
  } catch {
    // regex fallback
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (match && match[1]) return match[1];
  }
  return null;
}

// 1. Rota de Busca no YouTube (Músicas & Vídeos)
app.get('/api/youtube/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Parâmetro de busca "q" obrigatório' });
    }

    // Se o usuário colou um link direto do YouTube
    const directVideoId = extractYouTubeVideoId(query);
    if (directVideoId) {
      try {
        const directResult = await yts({ videoId: directVideoId });
        if (directResult) {
          return res.json({
            isDirectLink: true,
            results: [{
              id: directResult.videoId,
              title: directResult.title,
              url: directResult.url,
              duration: directResult.timestamp,
              seconds: directResult.seconds,
              author: directResult.author?.name || 'Canal do YouTube',
              thumbnail: directResult.thumbnail || `https://i.ytimg.com/vi/${directResult.videoId}/hqdefault.jpg`,
              image: directResult.image || `https://i.ytimg.com/vi/${directResult.videoId}/maxresdefault.jpg`,
              views: directResult.views || 0,
              ago: directResult.ago || ''
            }]
          });
        }
      } catch (err) {
        console.warn('Falha ao buscar videoId direto:', err);
      }
    }

    // Busca geral no YouTube
    const searchResults = await yts(query);
    const videos = (searchResults.videos || []).slice(0, 24).map(v => ({
      id: v.videoId,
      title: v.title,
      url: v.url,
      duration: v.timestamp,
      seconds: v.seconds,
      author: v.author?.name || 'YouTube',
      thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      image: v.image || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      views: v.views || 0,
      ago: v.ago || ''
    }));

    res.json({
      isDirectLink: false,
      results: videos
    });
  } catch (error: any) {
    console.error('Erro na rota /api/youtube/search:', error);
    res.status(500).json({ error: 'Falha ao buscar no YouTube', details: error.message });
  }
});

// 2. Rota de Informações de um Vídeo do YouTube
app.get('/api/youtube/info', async (req, res) => {
  try {
    const input = String(req.query.url || req.query.id || '').trim();
    const videoId = extractYouTubeVideoId(input);

    if (!videoId) {
      return res.status(400).json({ error: 'Link ou ID do YouTube inválido' });
    }

    const info = await yts({ videoId });
    if (!info) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    res.json({
      id: info.videoId,
      title: info.title,
      url: info.url,
      duration: info.timestamp,
      seconds: info.seconds,
      author: info.author?.name || 'Canal',
      thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${info.videoId}/hqdefault.jpg`,
      image: info.image || `https://i.ytimg.com/vi/${info.videoId}/maxresdefault.jpg`,
      views: info.views || 0,
      description: info.description || ''
    });
  } catch (error: any) {
    console.error('Erro na rota /api/youtube/info:', error);
    res.status(500).json({ error: 'Erro ao buscar informações do vídeo', details: error.message });
  }
});

// Cache directory para áudios completos processados
const CACHE_DIR = '/tmp/audioflix_mp3_cache';
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

function getCacheKey(artist?: string, title?: string, videoId?: string): string {
  const raw = `${artist || ''}_${title || ''}_${videoId || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return raw.substring(0, 80) || `track_${Date.now()}`;
}

// Helper universal de alta fidelidade para baixar áudio 100% completo como MP3
// Waterfall: 1) Cache local 2) YouTube direto 3) SoundCloud search 4) YouTube query fallback
async function downloadFullTrackAsMp3(
  title: string,
  artist: string,
  videoId?: string
): Promise<{ filePath: string; safeFilename: string; size: number }> {
  const cleanTitle = (title || 'Faixa').trim();
  const cleanArtist = (artist || '').trim();
  const safeFilename = `${cleanArtist ? `${cleanArtist} - ` : ''}${cleanTitle}`
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || `musica_${Date.now()}`;

  const cacheKey = getCacheKey(cleanArtist, cleanTitle, videoId);
  const cachedFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  // 1. Verifica se já existe em cache
  if (fs.existsSync(cachedFilePath)) {
    try {
      const stat = fs.statSync(cachedFilePath);
      if (stat.size > 200000) {
        return { filePath: cachedFilePath, safeFilename, size: stat.size };
      }
    } catch {}
  }

  const tempBase = `/tmp/dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const outPattern = `${tempBase}.%(ext)s`;
  const finalMp3 = `${tempBase}.mp3`;

  // Lista de estratégias de download em cascata (resiliente a bloqueios de IP de datacenter)
  const strategies: Array<{ name: string; target: string }> = [];

  if (videoId) {
    strategies.push({ name: 'YouTube Direct VideoID', target: `https://www.youtube.com/watch?v=${videoId}` });
  }
  if (cleanArtist || cleanTitle) {
    const query = `${cleanArtist} ${cleanTitle}`.trim();
    // SoundCloud é extremamente rápido, sem bloqueio de IP de datacenter, com faixa completa
    strategies.push({ name: 'SoundCloud Search', target: `scsearch1:${query}` });
    strategies.push({ name: 'YouTube Audio Search', target: `ytsearch1:${query} áudio oficial` });
    strategies.push({ name: 'YouTube Fallback Search', target: `ytsearch1:${query}` });
  }

  let lastError: any = null;

  for (const strat of strategies) {
    try {
      console.log(`[Download Engine] Tentando estratégia: ${strat.name} -> ${strat.target}`);
      await execFilePromise(ytDlpPath, [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--no-playlist',
        '--no-warnings',
        '-o', outPattern,
        strat.target
      ], { timeout: 45000 });

      if (fs.existsSync(finalMp3)) {
        const stat = fs.statSync(finalMp3);
        if (stat.size > 150000) {
          console.log(`[Download Engine] Sucesso com ${strat.name}! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
          // Salva no cache para acessos futuros instantâneos
          try {
            fs.copyFileSync(finalMp3, cachedFilePath);
          } catch {}
          return { filePath: finalMp3, safeFilename, size: stat.size };
        }
      }
    } catch (err: any) {
      console.warn(`[Download Engine] Falha na estratégia ${strat.name}:`, err.message?.substring(0, 120));
      lastError = err;
      // Limpa sobras temporárias antes da próxima tentativa
      try {
        if (fs.existsSync(finalMp3)) fs.unlinkSync(finalMp3);
      } catch {}
    }
  }

  throw new Error(`Não foi possível baixar o MP3 completo da faixa (${cleanArtist} - ${cleanTitle}). Motivo: ${lastError?.message || 'Servidores de streaming indisponíveis no momento.'}`);
}

// 2.1 Rota de Download Direto de Áudio / MP3 100% Completo (Sem corte de 30s e sem redirecionar)
app.get('/api/youtube/download', async (req, res) => {
  try {
    const input = String(req.query.url || req.query.id || '').trim();
    const videoId = extractYouTubeVideoId(input);
    const customTitle = String(req.query.title || '').trim();
    const customArtist = String(req.query.artist || '').trim();

    if (!videoId && !customTitle) {
      return res.status(400).json({ error: 'ID do YouTube ou Título da música obrigatório' });
    }

    const { filePath, safeFilename, size } = await downloadFullTrackAsMp3(
      customTitle || `Faixa_${videoId}`,
      customArtist,
      videoId || undefined
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeFilename)}.mp3"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.mp3`
    );
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', size);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    const cleanup = () => {
      // Se não for o arquivo do cache permanente, limpa o temporário
      if (!filePath.startsWith(CACHE_DIR)) {
        fs.unlink(filePath, () => {});
      }
    };
    readStream.on('close', cleanup);
    readStream.on('error', cleanup);
  } catch (error: any) {
    console.error('Erro na rota /api/youtube/download:', error);
    res.status(500).json({
      error: 'Falha ao processar download completo da faixa',
      details: error.message
    });
  }
});

// 2.2 Rota de Download de Música Completa por Nome/Artista (Resolve e baixa MP3 100% completo)
app.get('/api/music/download-full-track', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const videoId = String(req.query.youtubeId || '').trim();

    if (!title && !videoId) {
      return res.status(400).json({ error: 'Título ou youtubeId são obrigatórios' });
    }

    const { filePath, safeFilename, size } = await downloadFullTrackAsMp3(
      title,
      artist,
      videoId || undefined
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeFilename)}.mp3"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.mp3`
    );
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', size);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    const cleanup = () => {
      if (!filePath.startsWith(CACHE_DIR)) {
        fs.unlink(filePath, () => {});
      }
    };
    readStream.on('close', cleanup);
    readStream.on('error', cleanup);
  } catch (error: any) {
    console.error('Erro na rota /api/music/download-full-track:', error);
    res.status(500).json({
      error: 'Erro ao gerar MP3 completo da faixa',
      details: error.message
    });
  }
});

// 2.3 Rota de Streaming Direto de Áudio para o Reprodutor HTML5 (Sincronização Perfeita de Áudio)
app.get('/api/music/stream-audio', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const videoId = String(req.query.youtubeId || req.query.id || '').trim();

    if (!title && !videoId) {
      return res.status(400).json({ error: 'Título ou ID obrigatório para streaming' });
    }

    const cacheKey = getCacheKey(artist, title, videoId);
    const cachedFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

    // Se já estiver em cache, serve com suporte a Range requests (seek imediato no player)
    if (fs.existsSync(cachedFilePath)) {
      const stat = fs.statSync(cachedFilePath);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg'
        });
        fs.createReadStream(cachedFilePath, { start, end }).pipe(res);
        return;
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(cachedFilePath).pipe(res);
        return;
      }
    }

    // Se não estiver em cache, baixa em background e simultaneamente transmite
    const { filePath, size } = await downloadFullTrackAsMp3(title, artist, videoId || undefined);
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    console.error('Erro em /api/music/stream-audio:', err);
    res.status(500).json({ error: 'Falha ao transmitir áudio', details: err.message });
  }
});

// 2.3 Rota de Obtenção de Stream Direto de Áudio para o Reprodutor
app.get('/api/youtube/stream-url', async (req, res) => {
  try {
    const input = String(req.query.url || req.query.id || '').trim();
    const videoId = extractYouTubeVideoId(input);
    if (!videoId) return res.status(400).json({ error: 'ID ou URL obrigatório' });

    const { stdout } = await execFilePromise(ytDlpPath, [
      '-g',
      '-f', '140/251/bestaudio',
      `https://www.youtube.com/watch?v=${videoId}`
    ], { timeout: 15000 });

    const streamUrl = stdout.trim().split('\n')[0];
    res.json({ videoId, streamUrl });
  } catch (err: any) {
    res.status(500).json({ error: 'Falha ao extrair stream', details: err.message });
  }
});

// 3. Rota de Catálogo Musical Oficial (iTunes / Apple Music com country=BR e Categorização)
// Busca Artistas, Álbuns, Músicas e Singles
app.get('/api/music/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all'); // 'artist' | 'song' | 'album' | 'all'

    if (!query) {
      return res.status(400).json({ error: 'Termo de busca obrigatório' });
    }

    if (type === 'artist') {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&country=BR&limit=15`);
      const data = await resp.json();
      let artists = (data.results || []).map((a: any) => ({
        id: a.artistId,
        name: a.artistName,
        genre: a.primaryGenreName || 'Música',
        url: a.artistLinkUrl
      }));

      // Se a busca for por Jorge & Mateus, garante que a dupla oficial esteja destacada no topo
      if (/jorge\s*(&|e)\s*mateus/i.test(query)) {
        const jmOfficial = {
          id: 503554352,
          name: 'Jorge & Mateus',
          genre: 'Sertanejo',
          url: 'https://music.apple.com/br/artist/jorge-mateus/503554352'
        };
        artists = [jmOfficial, ...artists.filter((a: any) => a.id !== 503554352)];
      }

      return res.json({ results: artists });
    }

    if (type === 'album') {
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&country=BR&limit=50`);
      const data = await resp.json();
      
      // Filtra para manter somente ÁLBUNS REAIS (pelo menos 3 faixas, ignorando singles avulsos de 1 ou 2 músicas)
      const albums = (data.results || [])
        .filter((al: any) => {
          const trackCount = Number(al.trackCount || 1);
          const title = (al.collectionName || '').toLowerCase();
          return trackCount >= 3 && !title.includes('- single') && !title.includes('(single)');
        })
        .map((al: any) => {
          const title = al.collectionName || '';
          const lower = title.toLowerCase();
          const trackCount = Number(al.trackCount || 1);
          let category: 'live' | 'studio' | 'ep' = 'studio';
          let categoryLabel = 'Álbum de Estúdio';

          if (lower.includes('ao vivo') || lower.includes('live') || lower.includes('dvd') || lower.includes('show') || lower.includes('sem cortes')) {
            category = 'live';
            categoryLabel = 'Álbum Ao Vivo & DVD';
          } else if (lower.includes('ep') || lower.includes('coletânea') || lower.includes('sucessos') || trackCount <= 6) {
            category = 'ep';
            categoryLabel = 'EP & Especial';
          }

          return {
            id: al.collectionId,
            title,
            artist: al.artistName,
            artistId: al.artistId,
            year: al.releaseDate ? al.releaseDate.substring(0, 4) : '',
            trackCount,
            artwork: (al.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
            genre: al.primaryGenreName || 'Álbum',
            category,
            categoryLabel
          };
        });

      return res.json({ results: albums });
    }

    // Busca músicas e faixas
    const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&country=BR&limit=40`);
    const data = await resp.json();
    const songs = (data.results || []).map((s: any) => ({
      id: s.trackId,
      title: s.trackName,
      artist: s.artistName,
      artistId: s.artistId,
      album: s.collectionName,
      albumId: s.collectionId,
      durationSeconds: Math.round((s.trackTimeMillis || 0) / 1000),
      artwork: (s.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      previewUrl: s.previewUrl,
      trackNumber: s.trackNumber
    }));

    res.json({ results: songs });
  } catch (error: any) {
    console.error('Erro na rota /api/music/search:', error);
    res.status(500).json({ error: 'Erro ao buscar catálogo de música', details: error.message });
  }
});

// 4. Rota para Obter Discografia Categorizada de um Artista Específico
// Distingue com precisão: Álbuns Ao Vivo/DVDs, Álbuns de Estúdio, EPs e Músicas Avulsas/Singles
app.get('/api/music/artist/:id/albums', async (req, res) => {
  try {
    const artistId = req.params.id;

    // Busca detalhes do artista
    const artistLookupResp = await fetch(`https://itunes.apple.com/lookup?id=${artistId}&entity=musicArtist&country=BR`);
    const artistLookupData = await artistLookupResp.json();
    const artistInfo = artistLookupData.results?.find((r: any) => r.wrapperType === 'artist') || null;
    const artistName = artistInfo ? artistInfo.artistName : 'Artista';

    // Top Faixas do Artista
    const topTracksResp = await fetch(`https://itunes.apple.com/lookup?id=${artistId}&entity=song&country=BR&limit=15`);
    const topTracksData = await topTracksResp.json();
    const topTracks = (topTracksData.results || [])
      .filter((r: any) => r.wrapperType === 'track')
      .map((s: any) => ({
        id: s.trackId,
        title: s.trackName,
        artist: s.artistName,
        album: s.collectionName,
        durationSeconds: Math.round((s.trackTimeMillis || 0) / 1000),
        artwork: (s.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        previewUrl: s.previewUrl
      }));

    // Se for Jorge & Mateus (por ID 503554352 ou por nome)
    if (artistId === '503554352' || /jorge\s*(&|e)\s*mateus/i.test(artistName)) {
      const discography = classifyReleases([], 'Jorge & Mateus');
      return res.json({
        artist: {
          id: 503554352,
          name: 'Jorge & Mateus',
          genre: 'Sertanejo'
        },
        discography,
        albums: discography.allAlbums,
        standaloneSingles: discography.standaloneSingles,
        topTracks
      });
    }

    // Para outros artistas: busca discografia completa (limit 200 no Brasil)
    const albumsResp = await fetch(`https://itunes.apple.com/lookup?id=${artistId}&entity=album&country=BR&limit=200`);
    const albumsData = await albumsResp.json();
    const rawCollections = (albumsData.results || []).filter((r: any) => r.wrapperType === 'collection');

    // Classifica automaticamente os lançamentos
    const discography = classifyReleases(rawCollections, artistName);

    res.json({
      artist: artistInfo ? {
        id: artistInfo.artistId,
        name: artistInfo.artistName,
        genre: artistInfo.primaryGenreName
      } : {
        id: artistId,
        name: artistName,
        genre: 'Música'
      },
      discography,
      albums: discography.allAlbums,
      standaloneSingles: discography.standaloneSingles,
      topTracks
    });
  } catch (error: any) {
    console.error('Erro na rota /api/music/artist/:id/albums:', error);
    res.status(500).json({ error: 'Erro ao carregar discografia do artista', details: error.message });
  }
});

// 5. Rota para Obter Todas as Faixas de um Álbum ou Single
app.get('/api/music/album/:id/tracks', async (req, res) => {
  try {
    const albumId = req.params.id;

    // Tenta primeiro no Brasil
    let resp = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=BR&limit=60`);
    let data = await resp.json();

    // Se não encontrou no Brasil, tenta na loja global
    if (!data.results || data.results.length === 0) {
      resp = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song&limit=60`);
      data = await resp.json();
    }

    const albumInfo = data.results?.find((r: any) => r.wrapperType === 'collection') || null;
    const tracks = (data.results || [])
      .filter((r: any) => r.wrapperType === 'track')
      .map((t: any) => ({
        id: t.trackId,
        trackNumber: t.trackNumber || 1,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName,
        durationSeconds: Math.round((t.trackTimeMillis || 0) / 1000),
        previewUrl: t.previewUrl,
        artwork: (t.artworkUrl100 || albumInfo?.artworkUrl100 || '').replace('100x100bb', '600x600bb')
      }))
      .sort((a: any, b: any) => a.trackNumber - b.trackNumber);

    res.json({
      album: albumInfo ? {
        id: albumInfo.collectionId,
        title: albumInfo.collectionName,
        artist: albumInfo.artistName,
        year: albumInfo.releaseDate ? albumInfo.releaseDate.substring(0, 4) : '',
        trackCount: albumInfo.trackCount,
        artwork: (albumInfo.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        genre: albumInfo.primaryGenreName
      } : null,
      tracks
    });
  } catch (error: any) {
    console.error('Erro na rota /api/music/album/:id/tracks:', error);
    res.status(500).json({ error: 'Erro ao carregar faixas do álbum', details: error.message });
  }
});

// Inicia servidor com Vite Dev Middlewares
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AudioFlix server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
