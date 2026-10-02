import express from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import yts from 'yt-search';
import JSZip from 'jszip';
import {
  classifyReleases,
  JORGE_E_MATEUS_CANONICAL,
  ClassifiedAlbum
} from './src/utils/discographyData.ts';

const execFilePromise = promisify(execFile);
const ytDlpPath = path.resolve(process.cwd(), 'bin/yt-dlp');
try {
  if (fs.existsSync(ytDlpPath)) {
    fs.chmodSync(ytDlpPath, 0o755);
  }
} catch {}

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

    // Busca geral no YouTube com ordenação inteligente priorizando versões oficiais
    const searchResults = await yts(query);
    const videos = (searchResults.videos || []).map(v => ({
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
    })).sort((a, b) => {
      const getScore = (v: any) => {
        let score = 0;
        const t = (v.title || '').toLowerCase();
        const aut = (v.author || '').toLowerCase();
        if (t.includes('oficial') || t.includes('official')) score += 35;
        if (t.includes('áudio oficial') || t.includes('audio oficial') || t.includes('clipe oficial') || t.includes('official video') || t.includes('official audio')) score += 45;
        if (aut.includes('vevo') || aut.includes('topic') || aut.includes('oficial') || aut.includes('official')) score += 30;
        if (t.includes('cover') || t.includes('karaoke') || t.includes('karaokê') || t.includes('reaction') || t.includes('speed up') || t.includes('slowed') || t.includes('nightcore') || t.includes('paródia')) score -= 60;
        return score;
      };
      return getScore(b) - getScore(a);
    }).slice(0, 24);

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

const norm = (s: string) => (s || '').toLowerCase().replace(/&/g, 'e').replace(/[^a-z0-9]/g, '');

// Helper universal de alta fidelidade para baixar áudio 100% completo como MP3
// Waterfall Inteligente: 1) Cache local 2) SoundCloud Resiliente com queries limpas 3) YouTube Direto 4) YouTube Alternativo
function cleanMusicTitle(raw: string): string {
  return (raw || '')
    .replace(/\[(?:Clipe Oficial|Áudio Oficial|Vídeo Oficial|Official Video|Official Audio|DVD Ao Vivo|Ao Vivo|Live|Audio Oficial|Vídeo|Clipe).*?\]/gi, '')
    .replace(/\((?:Clipe Oficial|Áudio Oficial|Vídeo Oficial|Official Video|Official Audio|DVD Ao Vivo|Ao Vivo|Live|Audio Oficial|Vídeo|Clipe).*?\)/gi, '')
    .replace(/\b(?:HD|4K|1080p|720p)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCleanArtistAndSong(title: string, artist: string): { cleanArtist: string; cleanSong: string; queries: string[] } {
  let cleanArtist = (artist || '').trim()
    .replace(/\s*(?:Oficial|Official|VEVO|- Topic|Topic|Canal)\s*$/i, '')
    .trim();
    
  let cleanTitle = cleanMusicTitle(title || '');
  
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ').map(p => p.trim());
    const firstPart = parts[0];
    const rest = parts.slice(1).join(' - ');
    if (!cleanArtist || norm(firstPart) === norm(cleanArtist) || norm(firstPart).includes(norm(cleanArtist)) || norm(cleanArtist).includes(norm(firstPart))) {
      cleanArtist = cleanArtist || firstPart;
      cleanTitle = rest;
    }
  }

  // Remove sufixos de álbum e localizações ao vivo
  cleanTitle = cleanTitle
    .replace(/\s*-\s*(?:Ao Vivo|Terra Sem CEP|Como Sempre Feito Nunca|O Céu Explica Tudo|Aí Já Era|Na Medida Do Impossível|Ao Vivo em.*?|EP.*?|Single.*?)\s*$/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanSong = cleanTitle || 'Musica';
  const normArtist = cleanArtist.replace(/&/g, 'e').replace(/\s+/g, ' ').trim();
  const altArtist = cleanArtist.replace(/\be\b/gi, '&').replace(/\s+/g, ' ').trim();

  const queries = new Set<string>();
  if (cleanArtist && cleanSong) {
    queries.add(`${normArtist} ${cleanSong}`);
    queries.add(`${cleanArtist} ${cleanSong}`);
    if (altArtist !== cleanArtist) queries.add(`${altArtist} ${cleanSong}`);
    queries.add(`${cleanSong} ${normArtist}`);
  }
  if (cleanSong && cleanSong.length > 3) {
    queries.add(cleanSong);
  }
  const fullTitle = cleanMusicTitle(title || '');
  if (fullTitle && fullTitle !== cleanSong) {
    queries.add(fullTitle);
  }

  return { cleanArtist, cleanSong, queries: Array.from(queries) };
}

async function runDownloadAttempt(
  args: string[],
  target: string,
  finalMp3: string,
  tempBase: string,
  timeoutMs = 40000
): Promise<boolean> {
  try {
    await execFilePromise(ytDlpPath, [...args, target], { timeout: timeoutMs });
  } catch {
    // Código 101 de --max-downloads ou avisos não fatais são tratados verificando os arquivos abaixo
  }

  // 1. Verifica se o MP3 final foi gerado
  if (fs.existsSync(finalMp3)) {
    try {
      const stat = fs.statSync(finalMp3);
      if (stat.size > 150000) {
        return true;
      }
    } catch {}
  }

  // 2. Verifica se o áudio intermediário (.m4a, .webm, etc.) foi baixado e converte via ffmpeg
  const candidateExts = ['.m4a', '.webm', '.opus', '.aac', '.ogg', '.flac', '.mp4'];
  for (const ext of candidateExts) {
    const candidate = `${tempBase}${ext}`;
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.size > 150000) {
          await execFilePromise('ffmpeg', ['-y', '-i', candidate, '-vn', '-ab', '192k', finalMp3], { timeout: 20000 });
          if (fs.existsSync(finalMp3) && fs.statSync(finalMp3).size > 150000) {
            try { fs.unlinkSync(candidate); } catch {}
            return true;
          }
        }
      } catch {}
    }
  }

  return false;
}

async function downloadFullTrackAsMp3(
  title: string,
  artist: string,
  videoId?: string
): Promise<{ filePath: string; safeFilename: string; size: number }> {
  let initialTitle = (title || '').trim();
  let initialArtist = (artist || '').trim();

  // Se o título for genérico ou artista estiver vazio e tivermos o videoId, resolve metadados reais via yt-search
  if (videoId && (!initialArtist || !initialTitle || initialTitle.startsWith('Faixa_') || initialTitle === 'Faixa')) {
    try {
      const info = await yts({ videoId });
      if (info) {
        if (!initialTitle || initialTitle.startsWith('Faixa_') || initialTitle === 'Faixa') {
          initialTitle = info.title || initialTitle;
        }
        if (!initialArtist) {
          initialArtist = info.author?.name || '';
        }
      }
    } catch {}
  }

  const { cleanArtist, cleanSong, queries } = extractCleanArtistAndSong(initialTitle, initialArtist);

  const safeFilename = `${cleanArtist ? `${cleanArtist} - ` : ''}${cleanSong}`
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || `musica_${Date.now()}`;

  const cacheKey = getCacheKey(cleanArtist, cleanSong, videoId);
  const cachedFilePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  // 1. Verifica se já existe em cache local
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

  const commonArgs = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--no-playlist',
    '--no-warnings',
    '--ignore-errors',
    '-o', outPattern
  ];

  // Estratégia 1: Busca no SoundCloud com queries limpas e tolerância a DRM (--max-downloads 1)
  for (const q of queries) {
    if (!q || q.length < 2) continue;
    console.log(`[Download Engine] Tentando SoundCloud: ${q}`);
    const ok = await runDownloadAttempt(
      [...commonArgs, '--max-downloads', '1'],
      `scsearch5:${q}`,
      finalMp3,
      tempBase,
      35000
    );

    if (ok) {
      const stat = fs.statSync(finalMp3);
      console.log(`[Download Engine] Sucesso com SoundCloud! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
      try { fs.copyFileSync(finalMp3, cachedFilePath); } catch {}
      return { filePath: finalMp3, safeFilename, size: stat.size };
    }
  }

  // Estratégia 2: Se temos videoId direto do YouTube, tenta baixar direto
  if (videoId) {
    console.log(`[Download Engine] Tentando YouTube Direct VideoID: ${videoId}`);
    const ok = await runDownloadAttempt(
      [...commonArgs, '--extractor-args', 'youtube:player_client=android,web,tv'],
      `https://www.youtube.com/watch?v=${videoId}`,
      finalMp3,
      tempBase,
      35000
    );

    if (ok) {
      const stat = fs.statSync(finalMp3);
      console.log(`[Download Engine] Sucesso com YouTube Direct! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
      try { fs.copyFileSync(finalMp3, cachedFilePath); } catch {}
      return { filePath: finalMp3, safeFilename, size: stat.size };
    }
  }

  // Estratégia 3: Buscar alternativas no YouTube via yt-search (sem bloqueio) e tentar os IDs
  if (queries.length > 0) {
    try {
      const ytQuery = `${cleanArtist} ${cleanSong}`.trim();
      console.log(`[Download Engine] Buscando alternativas no YouTube via yt-search: ${ytQuery}`);
      const searchRes = await yts(ytQuery);
      const candidates = (searchRes.videos || []).slice(0, 3).map(v => v.videoId).filter(id => id && id !== videoId);
      for (const altId of candidates) {
        console.log(`[Download Engine] Tentando YouTube Alternativo VideoID: ${altId}`);
        const ok = await runDownloadAttempt(
          [...commonArgs, '--extractor-args', 'youtube:player_client=android,web,tv'],
          `https://www.youtube.com/watch?v=${altId}`,
          finalMp3,
          tempBase,
          30000
        );
        if (ok) {
          const stat = fs.statSync(finalMp3);
          console.log(`[Download Engine] Sucesso com YouTube Alternativo! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
          try { fs.copyFileSync(finalMp3, cachedFilePath); } catch {}
          return { filePath: finalMp3, safeFilename, size: stat.size };
        }
      }
    } catch {}
  }

  // Limpa arquivos residuais se tudo falhar
  try {
    if (fs.existsSync(finalMp3)) fs.unlinkSync(finalMp3);
  } catch {}

  throw new Error(`Não foi possível baixar o MP3 completo da faixa (${cleanArtist} - ${cleanSong}). Servidores de streaming temporariamente ocupados.`);
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

// 2.2.1 Rota de Download de Pacote ZIP de Músicas / Álbuns Completos
app.post('/api/zip/download', async (req, res) => {
  try {
    const { folderName, tracks } = req.body;
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: 'Nenhuma faixa informada para o ZIP' });
    }

    const safeZipName = (folderName || 'Musicas_AudioFlix')
      .replace(/[\/\\?%*:|"<>]/g, '_')
      .trim();

    const zip = new JSZip();
    const folder = zip.folder(safeZipName) || zip;

    // Processa faixas em lotes paralelos de 6 para acelerar significativamente o download do ZIP
    const BATCH_SIZE = 6;
    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
      const batch = tracks.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (t: any, idx: number) => {
          const trackNumber = i + idx + 1;
          const trackNumStr = trackNumber < 10 ? `0${trackNumber}` : `${trackNumber}`;
          const safeFilename = `${trackNumStr} - ${t.artist ? `${t.artist} - ` : ''}${t.title || 'Faixa'}.mp3`
            .replace(/[\/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, ' ');

          try {
            const { filePath } = await downloadFullTrackAsMp3(t.title, t.artist || '', t.youtubeId);
            if (fs.existsSync(filePath)) {
              const fileData = fs.readFileSync(filePath);
              folder.file(safeFilename, fileData);
            }
          } catch (err) {
            console.warn(`[ZIP Engine] Falha ao empacotar ${t.title}:`, err);
          }
        })
      );
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeZipName)}.zip"; filename*=UTF-8''${encodeURIComponent(safeZipName)}.zip`
    );
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (error: any) {
    console.error('Erro na rota /api/zip/download:', error);
    res.status(500).json({ error: 'Falha ao processar arquivo ZIP', details: error.message });
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
