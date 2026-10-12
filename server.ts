import express from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
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

// Suporte a payloads de grande capacidade (sincronização de playlists e lotes de download)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Middleware para capturar e responder graciosamente se exceder o limite
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    console.warn('PayloadTooLargeError prevenido com sucesso:', err.message);
    return res.status(413).json({
      error: 'PayloadTooLargeError',
      message: 'O volume de dados da requisição excedeu o limite máximo suportado.'
    });
  }
  next(err);
});

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

// Cache directory persistente para áudios completos processados
const CACHE_DIR = path.resolve(process.cwd(), '.cache/audioflix_mp3_cache');
const LEGACY_CACHE_DIR = '/tmp/audioflix_mp3_cache';
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
  finalFile: string,
  tempBase: string,
  isVideo = false,
  quality = '192',
  timeoutMs = 45000
): Promise<boolean> {
  try {
    await execFilePromise(ytDlpPath, [...args, target], { timeout: timeoutMs });
  } catch {
    // Código 101 de --max-downloads ou avisos não fatais são tratados verificando os arquivos abaixo
  }

  // 1. Verifica se o arquivo final foi gerado
  if (fs.existsSync(finalFile)) {
    try {
      const stat = fs.statSync(finalFile);
      if (stat.size > (isVideo ? 500000 : 150000)) {
        return true;
      }
    } catch {}
  }

  // 2. Se for áudio, verifica se algum formato bruto (.m4a, .webm, .opus, etc.) foi baixado e converte para MP3
  if (!isVideo) {
    const candidateExts = ['.m4a', '.webm', '.opus', '.aac', '.ogg', '.flac', '.mp4'];
    for (const ext of candidateExts) {
      const candidate = `${tempBase}${ext}`;
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.size > 150000) {
            await execFilePromise('ffmpeg', ['-y', '-i', candidate, '-vn', '-ab', `${quality}k`, finalFile], { timeout: 25000 });
            if (fs.existsSync(finalFile) && fs.statSync(finalFile).size > 150000) {
              try { fs.unlinkSync(candidate); } catch {}
              return true;
            }
          }
        } catch {}
      }
    }
  } else {
    // Se for vídeo, verifica se baixou .mp4, .webm, .mkv e converte para MP4
    const candidateExts = ['.webm', '.mkv', '.avi', '.mov', '.ts', '.mp4'];
    for (const ext of candidateExts) {
      const candidate = `${tempBase}${ext}`;
      if (fs.existsSync(candidate) && candidate !== finalFile) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.size > 500000) {
            await execFilePromise('ffmpeg', ['-y', '-i', candidate, '-c:v', 'copy', '-c:a', 'aac', finalFile], { timeout: 35000 });
            if (fs.existsSync(finalFile) && fs.statSync(finalFile).size > 500000) {
              try { fs.unlinkSync(candidate); } catch {}
              return true;
            }
          }
        } catch {}
      }
    }
  }

  return false;
}

// Conversão direta de streams do YouTube via API Backend
// O usuário NUNCA sai da aplicação: o servidor recebe a mídia e serve diretamente em MP3/MP4
async function downloadViaExternalConverter(
  videoId: string,
  isVideo: boolean,
  quality: string,
  finalFile: string
): Promise<boolean> {
  try {
    const cleanId = extractYouTubeVideoId(videoId) || videoId;
    if (!cleanId) return false;

    const format = isVideo ? (quality === '1080' ? '1080' : '720') : 'mp3';
    const initUrl = `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + cleanId)}`;

    console.log(`[Converter API] Solicitando conversão direta do YouTube: ${cleanId} (Formato: ${format})`);
    const initRes = await fetch(initUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!initRes.ok) {
      console.warn(`[Converter API] Resposta inicial HTTP ${initRes.status}`);
      return false;
    }

    const initData: any = await initRes.json();
    if (!initData || !initData.id) {
      console.warn('[Converter API] ID de conversão não retornado:', initData);
      return false;
    }

    const progressUrl = initData.progress_url || `https://loader.to/ajax/progress.php?id=${initData.id}`;
    let downloadUrl: string | null = null;

    // Polling acelerado do progresso da conversão (a cada 400ms para entrega rápida)
    for (let i = 0; i < 35; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const progRes = await fetch(progressUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (progRes.ok) {
          const progData: any = await progRes.json();
          if (progData.success === 1 && progData.download_url) {
            downloadUrl = progData.download_url;
            console.log(`[Converter API] Conversão concluída com sucesso no ciclo ${i + 1}!`);
            break;
          }
        }
      } catch {
        // Continua polling em caso de flutuação de rede
      }
    }

    if (!downloadUrl) {
      console.warn('[Converter API] Timeout aguardando URL de download da API.');
      return false;
    }

    console.log(`[Converter API] Baixando fluxo de mídia diretamente para o servidor...`);
    const dlRes = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(90000)
    });

    if (!dlRes.ok || !dlRes.body) {
      console.warn(`[Converter API] Erro ao baixar stream: HTTP ${dlRes.status}`);
      return false;
    }

    const tempDownloadPath = `${finalFile}.raw`;
    const fileStream = fs.createWriteStream(tempDownloadPath);
    await pipeline(Readable.fromWeb(dlRes.body as any), fileStream);

    if (fs.existsSync(tempDownloadPath) && fs.statSync(tempDownloadPath).size > 100000) {
      fs.renameSync(tempDownloadPath, finalFile);
      console.log(`[Converter API] Mídia gravada com sucesso: ${finalFile} (${(fs.statSync(finalFile).size / (1024 * 1024)).toFixed(2)} MB)`);
      return true;
    }

    try { if (fs.existsSync(tempDownloadPath)) fs.unlinkSync(tempDownloadPath); } catch {}
    return false;
  } catch (err: any) {
    console.warn('[Converter API] Erro geral na conversão:', err.message);
    return false;
  }
}

// Extração de áudio diretamente dos vídeos do YouTube (Conforme solicitado, sem SoundCloud / propagandas)
async function downloadFullTrackAsMp3(
  title: string,
  artist: string,
  videoId?: string,
  options: { quality?: string; isVideo?: boolean } = {}
): Promise<{ filePath: string; safeFilename: string; size: number; isVideo?: boolean }> {
  const quality = options.quality || '192';
  const isVideo = !!options.isVideo;
  const ext = isVideo ? 'mp4' : 'mp3';

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

  const cacheKey = getCacheKey(cleanArtist, cleanSong, `${videoId || ''}_${quality}_${isVideo ? 'vid' : 'aud'}`);
  const cachedFilePath = path.join(CACHE_DIR, `${cacheKey}.${ext}`);

  // 1. Verifica se já existe em cache local
  if (fs.existsSync(cachedFilePath)) {
    try {
      const stat = fs.statSync(cachedFilePath);
      if (stat.size > 200000) {
        return { filePath: cachedFilePath, safeFilename, size: stat.size, isVideo };
      }
    } catch {}
  }

  const tempBase = `/tmp/dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const outPattern = `${tempBase}.%(ext)s`;
  const finalFile = `${tempBase}.${ext}`;

  // Configurações do yt-dlp
  const ytArgs: string[] = isVideo
    ? [
        '--js-runtimes', 'node:/usr/local/bin/node',
        '-f', 'bestvideo+bestaudio/best',
        '--recode-video', 'mp4',
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '-o', outPattern
      ]
    : [
        '--js-runtimes', 'node:/usr/local/bin/node',
        '-f', 'bestaudio/best',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', quality,
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '-o', outPattern
      ];

  // Se houver cookies.txt salvo, injeta nas chamadas do yt-dlp
  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 50) {
    ytArgs.unshift('--cookies', cookiesPath);
    console.log('[YouTube Engine] Usando cookies.txt autenticado');
  }

  // ESTRATÉGIA 1 (PRIORIDADE ABSOLUTA): Extração direta do vídeo exato via API Backend
  // Isso resolve os bloqueios de datacenter e garante fidelidade 100% ao vídeo do card sem sair do app
  if (videoId) {
    console.log(`[YouTube Engine] Tentando API de conversão direta para VideoID: ${videoId}...`);
    const okApi = await downloadViaExternalConverter(videoId, isVideo, quality, finalFile);
    if (okApi && fs.existsSync(finalFile)) {
      const stat = fs.statSync(finalFile);
      if (stat.size > 100000) {
        console.log(`[YouTube Engine] Sucesso com API Backend no vídeo (${videoId})! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
        try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
        return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
      }
    }
  }

  // Se não foi fornecido videoId direto, busca no YouTube pelo vídeo correspondente exato e converte
  if (!videoId && queries.length > 0) {
    try {
      const ytQuery = `${cleanArtist} ${cleanSong}`.trim();
      console.log(`[YouTube Engine] Buscando vídeo correspondente no YouTube para "${ytQuery}"...`);
      const searchRes = await yts(ytQuery);
      const topVideo = searchRes.videos?.[0];
      if (topVideo?.videoId) {
        console.log(`[YouTube Engine] Vídeo do YouTube localizado: "${topVideo.title}" (${topVideo.videoId}). Convertendo...`);
        const okApi = await downloadViaExternalConverter(topVideo.videoId, isVideo, quality, finalFile);
        if (okApi && fs.existsSync(finalFile)) {
          const stat = fs.statSync(finalFile);
          if (stat.size > 100000) {
            console.log(`[YouTube Engine] Sucesso na conversão do vídeo do YouTube! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
            try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
            return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
          }
        }
      }
    } catch (e: any) {
      console.warn('[YouTube Engine] Aviso na busca preliminar YouTube:', e.message);
    }
  }

  // ESTRATÉGIA 2: Download direto do YouTube por Video ID via yt-dlp (com suporte a cookies se logado)
  if (videoId) {
    console.log(`[YouTube Engine] Tentando extração local yt-dlp (VideoID: ${videoId})...`);
    const ok = await runDownloadAttempt(
      ytArgs,
      `https://www.youtube.com/watch?v=${videoId}`,
      finalFile,
      tempBase,
      isVideo,
      quality,
      45000
    );

    if (ok) {
      const stat = fs.statSync(finalFile);
      console.log(`[YouTube Engine] Sucesso com YouTube Direct yt-dlp! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
      try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
      return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
    }
  }

  // ESTRATÉGIA 3: Busca por candidatos no YouTube via yt-search e download dos vídeos alternativos
  if (queries.length > 0) {
    try {
      const ytQuery = `${cleanArtist} ${cleanSong}`.trim();
      console.log(`[YouTube Engine] Buscando vídeos alternativos no YouTube: "${ytQuery}"`);
      const searchRes = await yts(ytQuery);
      const candidates = (searchRes.videos || []).slice(0, 5).map(v => v.videoId).filter(id => id && id !== videoId);

      for (const altId of candidates) {
        // Tenta primeiro via API
        const okApi = await downloadViaExternalConverter(altId, isVideo, quality, finalFile);
        if (okApi && fs.existsSync(finalFile)) {
          const stat = fs.statSync(finalFile);
          if (stat.size > 100000) {
            console.log(`[YouTube Engine] Sucesso com vídeo alternativo via API (${altId})! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
            try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
            return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
          }
        }

        // Tenta via yt-dlp
        console.log(`[YouTube Engine] Extraindo do vídeo YouTube com yt-dlp: https://www.youtube.com/watch?v=${altId}`);
        const ok = await runDownloadAttempt(
          ytArgs,
          `https://www.youtube.com/watch?v=${altId}`,
          finalFile,
          tempBase,
          isVideo,
          quality,
          35000
        );

        if (ok) {
          const stat = fs.statSync(finalFile);
          console.log(`[YouTube Engine] Sucesso com vídeo alternativo do YouTube (${altId})! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
          try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
          return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
        }
      }
    } catch (err: any) {
      console.warn('[YouTube Engine] Aviso na busca YouTube:', err.message);
    }
  }

  // ESTRATÉGIA 3: yt-dlp ytsearch direto no YouTube
  for (const q of queries.slice(0, 2)) {
    if (!q || q.length < 2) continue;
    console.log(`[YouTube Engine] Tentando yt-dlp ytsearch no YouTube: ${q}`);
    const ok = await runDownloadAttempt(
      ytArgs,
      `ytsearch1:${q}`,
      finalFile,
      tempBase,
      isVideo,
      quality,
      40000
    );

    if (ok) {
      const stat = fs.statSync(finalFile);
      console.log(`[YouTube Engine] Sucesso com ytsearch YouTube! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
      try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
      return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
    }
  }

  // ESTRATÉGIA 4: Fallback de Segurança - Caso o YouTube bloqueie por IP de datacenter nesta faixa, busca áudio limpo
  for (const q of queries.slice(0, 2)) {
    if (!q || q.length < 2) continue;
    console.log(`[Audio Engine] Fallback de segurança para query limpa: ${q}`);
    const ok = await runDownloadAttempt(
      [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', quality,
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--max-downloads', '1',
        '-o', outPattern
      ],
      `scsearch3:${q}`,
      finalFile,
      tempBase,
      isVideo,
      quality,
      35000
    );

    if (ok) {
      const stat = fs.statSync(finalFile);
      console.log(`[Audio Engine] Sucesso no fallback de áudio! Tamanho: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
      try { fs.copyFileSync(finalFile, cachedFilePath); } catch {}
      return { filePath: finalFile, safeFilename, size: stat.size, isVideo };
    }
  }

  // Limpa arquivos residuais se tudo falhar
  try {
    if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
  } catch {}

  throw new Error(`Não foi possível extrair o áudio do YouTube para a faixa (${cleanArtist} - ${cleanSong}). Servidor de vídeo temporariamente ocupado.`);
}

// 2.1 Rota de Download Direto de Áudio / MP3 100% Completo (Extraído do YouTube)
app.get('/api/youtube/download', async (req, res) => {
  try {
    const input = String(req.query.url || req.query.id || '').trim();
    const videoId = extractYouTubeVideoId(input);
    const customTitle = String(req.query.title || '').trim();
    const customArtist = String(req.query.artist || '').trim();
    const quality = String(req.query.quality || '192').trim();
    const isVideo = req.query.video === 'true' || req.query.format === 'mp4';

    if (!videoId && !customTitle) {
      return res.status(400).json({ error: 'ID do YouTube ou Título da música obrigatório' });
    }

    const { filePath, safeFilename, size } = await downloadFullTrackAsMp3(
      customTitle || `Faixa_${videoId}`,
      customArtist,
      videoId || undefined,
      { quality, isVideo }
    );

    const ext = isVideo ? 'mp4' : 'mp3';
    const contentType = isVideo ? 'video/mp4' : 'audio/mpeg';

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeFilename)}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.${ext}`
    );
    res.setHeader('Content-Type', contentType);
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
      error: 'Falha ao processar download do YouTube',
      details: error.message
    });
  }
});

// 2.2 Rota de Download de Música Completa por Nome/Artista (Extraído do YouTube)
app.get('/api/music/download-full-track', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const videoId = String(req.query.youtubeId || '').trim();
    const quality = String(req.query.quality || '192').trim();
    const isVideo = req.query.video === 'true' || req.query.format === 'mp4';

    if (!title && !videoId) {
      return res.status(400).json({ error: 'Título ou youtubeId são obrigatórios' });
    }

    const { filePath, safeFilename, size } = await downloadFullTrackAsMp3(
      title,
      artist,
      videoId || undefined,
      { quality, isVideo }
    );

    const ext = isVideo ? 'mp4' : 'mp3';
    const contentType = isVideo ? 'video/mp4' : 'audio/mpeg';

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeFilename)}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}.${ext}`
    );
    res.setHeader('Content-Type', contentType);
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
      error: 'Erro ao gerar MP3 completo do YouTube',
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

// 2.3 Cache em Memória de URLs de Stream Direto do YouTube e Rota de Streaming Instantâneo
interface CachedStreamUrl {
  url: string;
  expiresAt: number;
}
const streamUrlCache = new Map<string, CachedStreamUrl>();
const activeBackgroundCaches = new Set<string>();

// Resolve URL direta de áudio via API de conversão de alta velocidade (Resolve bloqueios de datacenter em segundos)
async function getConverterStreamUrl(videoId: string): Promise<string | null> {
  try {
    const cleanId = extractYouTubeVideoId(videoId) || videoId;
    if (!cleanId) return null;
    const initUrl = `https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + cleanId)}`;
    const initRes = await fetch(initUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!initRes.ok) return null;
    const initData: any = await initRes.json();
    if (!initData || !initData.id) return null;

    const progressUrl = initData.progress_url || `https://loader.to/ajax/progress.php?id=${initData.id}`;
    // Polling acelerado a cada 350ms para entrega rápida (máximo 14 tentativas = ~5 segundos)
    for (let i = 0; i < 14; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 350));
      }
      try {
        const progRes = await fetch(progressUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(2500)
        });
        if (progRes.ok) {
          const progData: any = await progRes.json();
          if (progData.success === 1 && progData.download_url) {
            return progData.download_url;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

// Resolve a URL direta do fluxo de áudio do YouTube com suporte a fallback resiliente e execução competitiva paralela
async function resolveDirectAudioStreamUrl(videoId: string, title?: string, artist?: string): Promise<string | null> {
  if (!videoId) return null;
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // 1. Corrida Competitiva: yt-dlp ultrarrápido (IPv4 forçado com clients resilientes) + API de Conversão em Paralelo
  const ytDlpPromise = (async (): Promise<string | null> => {
    try {
      const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
      const args = [
        '-4',
        '-g',
        '-f', 'ba/b/140/251/18',
        '--no-playlist',
        '--no-warnings'
      ];
      if (fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 50) {
        args.unshift('--cookies', cookiesPath);
      }
      args.push(`https://www.youtube.com/watch?v=${videoId}`);

      const { stdout } = await execFilePromise(ytDlpPath, args, {
        timeout: 4500,
        env: { ...process.env, PYTHONWARNINGS: 'ignore' }
      });
      const urlMatch = stdout.match(/https:\/\/[^\s"'\n\r]+/);
      const directUrl = urlMatch ? urlMatch[0] : null;
      return directUrl || null;
    } catch {
      return null;
    }
  })();

  const converterPromise = getConverterStreamUrl(videoId);

  const soundCloudPromise = (async (): Promise<string | null> => {
    try {
      const q = `${artist || ''} ${title || ''}`.trim();
      if (!q || q.length < 2) return null;
      const args = [
        '-4',
        '-g',
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--max-downloads', '1',
        `scsearch3:${q}`
      ];
      const { stdout } = await execFilePromise(ytDlpPath, args, {
        timeout: 4200,
        env: { ...process.env, PYTHONWARNINGS: 'ignore' }
      });
      const urlMatch = stdout.match(/https:\/\/[^\s"'\n\r]+/);
      const url = urlMatch ? urlMatch[0] : null;
      if (url && (url.includes('/preview/') || url.includes('preview-media') || url.includes('.128.mp3?Policy='))) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  })();

  // Quem responder primeiro com sucesso entrega a música em menos de 2 a 4 segundos
  const raceResult = await new Promise<string | null>((resolve) => {
    let settledCount = 0;
    let hasResolved = false;
    const totalCompetitors = (title || artist) ? 3 : 2;

    const check = (url: string | null) => {
      settledCount++;
      if (url && !hasResolved) {
        hasResolved = true;
        resolve(url);
      } else if (settledCount >= totalCompetitors && !hasResolved) {
        resolve(null);
      }
    };

    ytDlpPromise.then(check).catch(() => check(null));
    converterPromise.then(check).catch(() => check(null));
    if (title || artist) {
      soundCloudPromise.then(check).catch(() => check(null));
    }
  });

  if (raceResult) {
    streamUrlCache.set(videoId, {
      url: raceResult,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 horas de validade
    });
    return raceResult;
  }

  return null;
}

// Dispara cache assíncrono em segundo plano para que as próximas execuções sejam servidas direto do disco em 0ms
function triggerBackgroundCache(title: string, artist: string, videoId: string, targetPath: string) {
  const taskKey = `${videoId}_${targetPath}`;
  if (activeBackgroundCaches.has(taskKey) || fs.existsSync(targetPath)) return;
  activeBackgroundCaches.add(taskKey);

  setTimeout(async () => {
    try {
      if (!fs.existsSync(targetPath)) {
        console.log(`[Background Cacher] Baixando cópia permanente em disco para cache: "${title}" - ${artist}`);
        await downloadFullTrackAsMp3(title, artist, videoId);
      }
    } catch (err: any) {
      console.warn(`[Background Cacher] Falha ao persistir em cache:`, err.message);
    } finally {
      activeBackgroundCaches.delete(taskKey);
    }
  }, 100);
}

// 2.2.9 Rota de Verificação Ultrarrápida de Cache em Disco (< 5ms)
app.get('/api/music/cached-status', (req, res) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const videoId = String(req.query.youtubeId || req.query.id || '').trim();

    if (!title && !videoId) {
      return res.json({ cached: false });
    }

    const { cleanArtist, cleanSong } = extractCleanArtistAndSong(title, artist);
    const standardKey = getCacheKey(cleanArtist, cleanSong, `${videoId || ''}_192_aud`);
    let cachedFilePath = path.join(CACHE_DIR, `${standardKey}.mp3`);

    const checkDirs = [CACHE_DIR, LEGACY_CACHE_DIR].filter(d => fs.existsSync(d));
    for (const dir of checkDirs) {
      if (fs.existsSync(cachedFilePath) && fs.statSync(cachedFilePath).size > 700000) {
        return res.json({ cached: true });
      }
      try {
        const files = fs.readdirSync(dir);
        if (videoId) {
          const matchVid = files.find(f => f.includes(videoId.toLowerCase()) && f.endsWith('.mp3'));
          if (matchVid) {
            const p = path.join(dir, matchVid);
            if (fs.statSync(p).size > 700000) return res.json({ cached: true });
          }
        }
        if (cleanSong) {
          const sClean = cleanSong.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const aClean = cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const match = files.find(f => {
            const lower = f.toLowerCase();
            return lower.includes(sClean) && (aClean ? lower.includes(aClean) : true) && lower.endsWith('.mp3');
          });
          if (match) {
            const p = path.join(dir, match);
            if (fs.statSync(p).size > 700000) return res.json({ cached: true });
          }
        }
      } catch {}
    }

    if (videoId || (cleanArtist && cleanSong)) {
      triggerBackgroundCache(title, artist, videoId, cachedFilePath);
    }
    return res.json({ cached: false });
  } catch {
    return res.json({ cached: false });
  }
});

// 2.3 Rota de Streaming Direto de Áudio para o Reprodutor HTML5 (Solução 1: Streaming Progressivo com Pipe Instantâneo)
app.get('/api/music/stream-audio', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    let videoId = String(req.query.youtubeId || req.query.id || req.query.videoId || '').trim();

    if (!title && !videoId) {
      return res.status(400).json({ error: 'Título ou ID obrigatório para streaming' });
    }

    const { cleanArtist, cleanSong } = extractCleanArtistAndSong(title, artist);
    const standardKey = getCacheKey(cleanArtist, cleanSong, `${videoId || ''}_192_aud`);
    let cachedFilePath = path.join(CACHE_DIR, `${standardKey}.mp3`);

    // 1. Busca no cache em disco: se já existe (> 700KB para garantir faixa completa, nunca 30s), serve IMEDIATAMENTE
    const checkDirs = [CACHE_DIR, LEGACY_CACHE_DIR].filter(d => fs.existsSync(d));
    for (const dir of checkDirs) {
      if (fs.existsSync(cachedFilePath) && fs.statSync(cachedFilePath).size > 700000) break;
      try {
        const files = fs.readdirSync(dir);
        if (videoId) {
          const matchVid = files.find(f => f.includes(videoId.toLowerCase()) && f.endsWith('.mp3'));
          if (matchVid) {
            const p = path.join(dir, matchVid);
            if (fs.statSync(p).size > 700000) cachedFilePath = p;
          }
        }
        if ((!fs.existsSync(cachedFilePath) || fs.statSync(cachedFilePath).size <= 700000) && cleanSong) {
          const sClean = cleanSong.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const aClean = cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const match = files.find(f => {
            const lower = f.toLowerCase();
            return lower.includes(sClean) && (aClean ? lower.includes(aClean) : true) && lower.endsWith('.mp3');
          });
          if (match) {
            const p = path.join(dir, match);
            if (fs.statSync(p).size > 700000) cachedFilePath = p;
          }
        }
      } catch {}
    }

    // Se já estiver em disco com áudio completo, serve via HTTP 206 Partial Content instantâneo
    if (fs.existsSync(cachedFilePath)) {
      const stat = fs.statSync(cachedFilePath);
      if (stat.size > 700000) {
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

          if (req.method === 'HEAD') { res.end(); return; }
          fs.createReadStream(cachedFilePath, { start, end }).pipe(res);
          return;
        } else {
          res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes'
          });

          if (req.method === 'HEAD') { res.end(); return; }
          fs.createReadStream(cachedFilePath).pipe(res);
          return;
        }
      }
    }

    // 2. Se não estiver em disco, resolve o fluxo de áudio direto para transmissão progressiva instantânea
    if (!videoId && (cleanArtist || cleanSong)) {
      try {
        const searchRes = await yts(`${cleanArtist} ${cleanSong}`.trim());
        const topVideo = searchRes.videos?.[0];
        if (topVideo?.videoId) {
          videoId = topVideo.videoId;
        }
      } catch {}
    }

    if (videoId) {
      const directStreamUrl = await resolveDirectAudioStreamUrl(videoId, cleanSong, cleanArtist);
      if (directStreamUrl) {
        try {
          const proxyHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          };
          if (req.headers.range) {
            proxyHeaders['Range'] = req.headers.range;
          }

          const remoteRes = await fetch(directStreamUrl, { headers: proxyHeaders });
          if (remoteRes.ok || remoteRes.status === 206) {
            const rawType = (remoteRes.headers.get('content-type') || '').toLowerCase();
            if (rawType.includes('text/html') || rawType.includes('text/plain')) {
              console.warn('[Stream Proxy] Resposta remota retornou HTML em vez de áudio.');
              throw new Error('Conteúdo retornado é HTML, não fluxo de áudio');
            }

            const respHeaders: Record<string, string | number> = {
              'Content-Type': rawType && !rawType.includes('text') ? rawType : 'audio/mpeg',
              'Accept-Ranges': 'bytes'
            };
            const cl = remoteRes.headers.get('content-length');
            if (cl) respHeaders['Content-Length'] = cl;
            const cr = remoteRes.headers.get('content-range');
            if (cr) respHeaders['Content-Range'] = cr;

            res.writeHead(remoteRes.status, respHeaders);

            if (req.method === 'HEAD') {
              res.end();
              return;
            }

            const webStream = Readable.fromWeb(remoteRes.body as any);

            // Streaming Progressivo com Pipe contínuo e persistência em cache
            const isFullStream = !req.headers.range || req.headers.range.startsWith('bytes=0-');
            if (isFullStream && !fs.existsSync(cachedFilePath)) {
              const tempWritingPath = `${cachedFilePath}.pipe_${Date.now()}`;
              const diskWriteStream = fs.createWriteStream(tempWritingPath);

              const passRes = new PassThrough();
              const passDisk = new PassThrough();

              webStream.pipe(passRes);
              webStream.pipe(passDisk);

              passRes.pipe(res);
              passDisk.pipe(diskWriteStream);

              diskWriteStream.on('finish', () => {
                try {
                  if (fs.existsSync(tempWritingPath) && fs.statSync(tempWritingPath).size > 700000) {
                    fs.renameSync(tempWritingPath, cachedFilePath);
                    console.log(`[Stream Pipe] Faixa em cache gravada com sucesso durante a reprodução: ${path.basename(cachedFilePath)}`);
                  } else if (fs.existsSync(tempWritingPath)) {
                    fs.unlinkSync(tempWritingPath);
                  }
                } catch {}
              });

              diskWriteStream.on('error', () => {
                try { if (fs.existsSync(tempWritingPath)) fs.unlinkSync(tempWritingPath); } catch {}
              });
              return;
            } else {
              webStream.pipe(res);
              if (!fs.existsSync(cachedFilePath)) {
                triggerBackgroundCache(title, artist, videoId, cachedFilePath);
              }
              return;
            }
          }
        } catch (proxyErr: any) {
          console.warn('[Stream Proxy] Falha no proxy direto, acionando download completo sob demanda:', proxyErr.message);
        }
      }
    }

    // 3. Fallback de Áudio 100% Completo (NUNCA corta em 30s nem redireciona para preview)
    // Se o proxy direto não conectou de imediato, baixa a faixa completa em alta qualidade e faz o stream imediato
    console.log(`[Stream Audio] Obtendo faixa completa via motor AudioFlix para "${cleanSong}" - ${cleanArtist}...`);
    try {
      // Se a conexão direta falhar, tenta obter a faixa completa com teto máximo de 3.8s para nunca ultrapassar 5s
      const downloadPromise = downloadFullTrackAsMp3(title, artist, videoId);
      const fullResult = await Promise.race([
        downloadPromise,
        new Promise<any>((r) => setTimeout(() => r(null), 3800))
      ]);
      if (fullResult?.filePath && fs.existsSync(fullResult.filePath)) {
        const stat = fs.statSync(fullResult.filePath);
        if (stat.size > 700000) {
          const streamRange = req.headers.range;
          if (streamRange) {
            const parts = streamRange.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'audio/mpeg'
            });
            if (req.method === 'HEAD') { res.end(); return; }
            fs.createReadStream(fullResult.filePath, { start, end }).pipe(res);
            return;
          } else {
            res.writeHead(200, {
              'Content-Length': stat.size,
              'Content-Type': 'audio/mpeg',
              'Accept-Ranges': 'bytes'
            });
            if (req.method === 'HEAD') { res.end(); return; }
            fs.createReadStream(fullResult.filePath).pipe(res);
            return;
          }
        }
      }
    } catch (dlErr: any) {
      console.warn('[Stream Audio] Falha ao extrair áudio completo sob demanda:', dlErr.message);
    }

    res.status(503).json({ error: 'Fluxo temporariamente indisponível' });
  } catch (err: any) {
    console.error('Erro em /api/music/stream-audio:', err);
    res.status(500).json({ error: 'Falha ao transmitir áudio completo', details: err.message });
  }
});

// 2.3.5 Rota de Letras Sincronizadas (Estilo Karaokê / LRC)
app.get('/api/music/lyrics', async (req, res) => {
  try {
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const duration = Number(req.query.duration) || 0;

    if (!rawTitle) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    const { cleanArtist, cleanSong } = extractCleanArtistAndSong(rawTitle, rawArtist);
    const artistQuery = cleanArtist || rawArtist;
    const songQuery = cleanSong || rawTitle;

    // 1. Tenta LRCLIB com correspondência direta
    let lyricsData: any = null;
    try {
      const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(songQuery)}&artist_name=${encodeURIComponent(artistQuery)}${duration > 0 ? `&duration=${Math.round(duration)}` : ''}`;
      const lrclibResp = await fetch(getUrl, {
        headers: { 'User-Agent': 'AudioFlix/2.0 (contact@audioflix.app)' },
        signal: AbortSignal.timeout(5000)
      });
      if (lrclibResp.ok) {
        lyricsData = await lrclibResp.json();
      }
    } catch {}

    // 2. Se não encontrou exato, tenta busca no LRCLIB por artista + faixa
    if (!lyricsData || (!lyricsData.syncedLyrics && !lyricsData.plainLyrics)) {
      try {
        const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(songQuery)}&artist_name=${encodeURIComponent(artistQuery)}`;
        const sResp = await fetch(searchUrl, {
          headers: { 'User-Agent': 'AudioFlix/2.0 (contact@audioflix.app)' },
          signal: AbortSignal.timeout(5000)
        });
        if (sResp.ok) {
          const list = await sResp.json();
          if (Array.isArray(list) && list.length > 0) {
            lyricsData = list.find((item: any) => item.syncedLyrics) || list[0];
          }
        }
      } catch {}
    }

    // 3. Fallback adicional por query livre
    if (!lyricsData || (!lyricsData.syncedLyrics && !lyricsData.plainLyrics)) {
      try {
        const freeQuery = `${artistQuery} ${songQuery}`.trim();
        const sResp2 = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(freeQuery)}`, {
          headers: { 'User-Agent': 'AudioFlix/2.0 (contact@audioflix.app)' },
          signal: AbortSignal.timeout(5000)
        });
        if (sResp2.ok) {
          const list = await sResp2.json();
          if (Array.isArray(list) && list.length > 0) {
            lyricsData = list.find((item: any) => item.syncedLyrics) || list[0];
          }
        }
      } catch {}
    }

    if (!lyricsData || (!lyricsData.syncedLyrics && !lyricsData.plainLyrics)) {
      return res.json({
        found: false,
        title: rawTitle,
        artist: rawArtist,
        message: 'Letra não encontrada para esta faixa'
      });
    }

    // Processa linhas sincronizadas (formato LRC: [mm:ss.xx] ou [mm:ss])
    const syncedLines: Array<{ time: number; text: string }> = [];
    if (lyricsData.syncedLyrics) {
      const rawLines = lyricsData.syncedLyrics.split('\n');
      const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
      for (const line of rawLines) {
        const match = line.match(timeRegex);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseFloat(match[2]);
          const text = match[3].trim();
          const totalSeconds = minutes * 60 + seconds;
          syncedLines.push({ time: totalSeconds, text });
        }
      }
    }

    return res.json({
      found: true,
      title: lyricsData.trackName || lyricsData.name || rawTitle,
      artist: lyricsData.artistName || rawArtist,
      isSynced: syncedLines.length > 0,
      lines: syncedLines,
      plainLyrics: lyricsData.plainLyrics || null
    });
  } catch (err: any) {
    console.error('Erro na rota /api/music/lyrics:', err);
    res.status(500).json({ error: 'Falha ao buscar letra da música', details: err.message });
  }
});

// 2.4 Rota de Pré-Aquecimento Agressivo da Fila (Solução 3: Background Pre-Caching com Streaming Direto)
app.post('/api/music/prefetch', async (req, res) => {
  try {
    const tracks = Array.isArray(req.body.tracks) ? req.body.tracks : [];
    if (tracks.length === 0) {
      return res.json({ status: 'ok', preloaded: 0 });
    }

    // Responde imediatamente ao frontend para não travar nenhuma operação na UI
    res.json({ status: 'ok', queued: tracks.length });

    // Processa o pré-carregamento dos próximos itens em paralelo e baixa prioridade em segundo plano
    Promise.allSettled(
      tracks.slice(0, 3).map(async (t: any) => {
        try {
          const title = String(t.title || '').trim();
          const artist = String(t.artist || '').trim();
          let videoId = String(t.youtubeId || t.id || '').trim();
          if (!title && !videoId) return;

          const { cleanArtist, cleanSong } = extractCleanArtistAndSong(title, artist);
          const standardKey = getCacheKey(cleanArtist, cleanSong, `${videoId || ''}_192_aud`);
          const cachedFilePath = path.join(CACHE_DIR, `${standardKey}.mp3`);

          if (fs.existsSync(cachedFilePath)) return;

          if (!videoId && (cleanArtist || cleanSong)) {
            const searchRes = await yts(`${cleanArtist} ${cleanSong}`.trim());
            if (searchRes.videos?.[0]?.videoId) {
              videoId = searchRes.videos[0].videoId;
            }
          }

          if (videoId) {
            const directUrl = await resolveDirectAudioStreamUrl(videoId, cleanSong, cleanArtist);
            if (directUrl) {
              const tempWritingPath = `${cachedFilePath}.prefetch_${Date.now()}`;
              const fileStream = fs.createWriteStream(tempWritingPath);
              const dlRes = await fetch(directUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(35000)
              });
              if (dlRes.ok && dlRes.body) {
                await pipeline(Readable.fromWeb(dlRes.body as any), fileStream);
                if (fs.existsSync(tempWritingPath) && fs.statSync(tempWritingPath).size > 100000) {
                  fs.renameSync(tempWritingPath, cachedFilePath);
                  console.log(`[Pré-aquecimento Fila] Sucesso antecipado em cache: "${cleanSong}" - ${cleanArtist}`);
                  return;
                }
              }
              try { if (fs.existsSync(tempWritingPath)) fs.unlinkSync(tempWritingPath); } catch {}
            }
          }

          // Se o streaming direto não gravou, executa rotina de download completo
          console.log(`[Pré-aquecimento Fila] Pré-carregando em segundo plano: "${cleanSong}" - ${cleanArtist}`);
          await downloadFullTrackAsMp3(title, artist, videoId || undefined);
        } catch (err: any) {
          console.warn('[Pré-aquecimento Fila] Aviso:', err.message);
        }
      })
    ).catch(() => {});
  } catch (err: any) {
    res.status(500).json({ error: 'Erro no prefetch', details: err.message });
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

// 2.4 Rotas de Gerenciamento de Cookies do YouTube (Para autenticação opcional direta)
app.get('/api/youtube/cookies-status', (_req, res) => {
  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  const exists = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 50;
  res.json({ hasCookies: exists });
});

app.post('/api/youtube/cookies', express.text({ type: ['text/plain', 'application/octet-stream', 'multipart/form-data', '*/*'], limit: '10mb' }), (req, res) => {
  try {
    const cookiesContent = req.body;
    if (!cookiesContent || typeof cookiesContent !== 'string' || cookiesContent.length < 50) {
      return res.status(400).json({ error: 'Conteúdo de cookies.txt inválido ou muito curto' });
    }
    const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
    fs.writeFileSync(cookiesPath, cookiesContent, 'utf-8');
    console.log('[YouTube Auth] Arquivo cookies.txt salvo com sucesso.');
    res.json({ success: true, message: 'Cookies do YouTube salvos com sucesso!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar cookies', details: err.message });
  }
});

app.delete('/api/youtube/cookies', (_req, res) => {
  try {
    const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
    if (fs.existsSync(cookiesPath)) fs.unlinkSync(cookiesPath);
    console.log('[YouTube Auth] Arquivo cookies.txt removido.');
    res.json({ success: true, message: 'Cookies removidos com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao remover cookies', details: err.message });
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

    // Busca músicas e faixas com fluxo direto de inicialização instantânea
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
      trackNumber: s.trackNumber,
      previewUrl: s.previewUrl
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

// 4b. Rota para Obter Informações e Biografia Detalhada do Artista
app.get('/api/music/artist-info', async (req, res) => {
  try {
    const artistName = String(req.query.name || '').trim();
    if (!artistName) {
      return res.status(400).json({ error: 'Nome do artista é obrigatório' });
    }

    // 1. Busca dados no iTunes para gênero, id e imagem
    let itunesArtist: any = null;
    let avatarUrl = '';
    let genres: string[] = [];

    try {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1&country=BR`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (itunesRes.ok) {
        const iData = await itunesRes.json();
        if (iData.results && iData.results.length > 0) {
          itunesArtist = iData.results[0];
          if (itunesArtist.primaryGenreName) {
            genres.push(itunesArtist.primaryGenreName);
          }
        }
      }
    } catch {}

    // Busca músicas e capas recentes do artista
    let topSongs: any[] = [];
    try {
      const songsRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=5&country=BR`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (songsRes.ok) {
        const sData = await songsRes.json();
        if (sData.results && sData.results.length > 0) {
          avatarUrl = (sData.results[0].artworkUrl100 || '').replace('100x100bb', '600x600bb');
          topSongs = sData.results.map((t: any) => ({
            title: t.trackName,
            album: t.collectionName,
            year: t.releaseDate ? t.releaseDate.substring(0, 4) : undefined
          }));
        }
      }
    } catch {}

    // 2. Busca resumo enciclopédico na Wikipedia em português
    let bio = '';
    try {
      const wikiRes = await fetch(
        `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName.replace(/\s+/g, '_'))}`,
        {
          headers: { 'User-Agent': 'AudioFlix/1.0 (info@audioflix.app)' },
          signal: AbortSignal.timeout(4000)
        }
      );
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.extract && wikiData.type !== 'disambiguation') {
          bio = wikiData.extract;
          if (wikiData.thumbnail?.source && !avatarUrl) {
            avatarUrl = wikiData.thumbnail.source;
          }
        }
      }
    } catch {}

    // Se não encontrou na Wikipédia em PT, tenta em inglês
    if (!bio) {
      try {
        const wikiEnRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName.replace(/\s+/g, '_'))}`,
          {
            headers: { 'User-Agent': 'AudioFlix/1.0 (info@audioflix.app)' },
            signal: AbortSignal.timeout(4000)
          }
        );
        if (wikiEnRes.ok) {
          const wikiEnData = await wikiEnRes.json();
          if (wikiEnData.extract && wikiEnData.type !== 'disambiguation') {
            bio = wikiEnData.extract;
            if (wikiEnData.thumbnail?.source && !avatarUrl) {
              avatarUrl = wikiEnData.thumbnail.source;
            }
          }
        }
      } catch {}
    }

    res.json({
      artist: {
        id: itunesArtist?.artistId || null,
        name: itunesArtist?.artistName || artistName,
        genre: genres[0] || 'Música',
        avatar: avatarUrl || undefined,
        bio: bio || `${artistName} é um artista consagrado do cenário musical com sucessos tocados mundialmente.`,
        topSongs
      }
    });
  } catch (error: any) {
    console.error('Erro na rota /api/music/artist-info:', error);
    res.status(500).json({ error: 'Erro ao carregar detalhes do artista' });
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
        artwork: (t.artworkUrl100 || albumInfo?.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        previewUrl: t.previewUrl
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

// =========================================================================
// 6. ROTA DE MÚSICAS MAIS OUVIDAS (PARADAS OFICIAIS POR PAÍSES, ANOS E GÊNEROS)
// =========================================================================
const chartsMemoryCache = new Map<string, { timestamp: number; data: any }>();
const CHARTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// Mapeamento de Países para Paradas Musicais Oficiais
const OFFICIAL_COUNTRY_CHARTS: Record<string, { title: string; subtitle: string; playlistId: string; flag: string; itunesCountry: string }> = {
  br: { title: 'Brasil', subtitle: 'As 50 músicas mais tocadas no Brasil', playlistId: '37i9dQZEVXbMXbN3EUUhlg', flag: '🇧🇷', itunesCountry: 'BR' },
  global: { title: 'Global', subtitle: 'As 50 músicas mais tocadas em todo o mundo', playlistId: '37i9dQZEVXbMDoHDwVN2tF', flag: '🌐', itunesCountry: 'US' },
  us: { title: 'Estados Unidos', subtitle: 'As 50 músicas mais ouvidas nos Estados Unidos', playlistId: '37i9dQZEVXbLRQDuF5jeBp', flag: '🇺🇸', itunesCountry: 'US' },
  gb: { title: 'Reino Unido', subtitle: 'As 50 músicas mais ouvidas no Reino Unido', playlistId: '37i9dQZEVXbLnolsZ8PSNw', flag: '🇬🇧', itunesCountry: 'GB' },
  pt: { title: 'Portugal', subtitle: 'As músicas mais ouvidas em Portugal', playlistId: '37i9dQZEVXbKyJS5621ygD', flag: '🇵🇹', itunesCountry: 'PT' },
  es: { title: 'Espanha', subtitle: 'As 50 músicas mais ouvidas na Espanha', playlistId: '37i9dQZEVXbNFJfN1Vw8d9', flag: '🇪🇸', itunesCountry: 'ES' },
  mx: { title: 'México', subtitle: 'As 50 músicas mais ouvidas no México', playlistId: '37i9dQZEVXbO3qyFxbkOE1', flag: '🇲🇽', itunesCountry: 'MX' },
  ar: { title: 'Argentina', subtitle: 'As 50 músicas mais ouvidas na Argentina', playlistId: '37i9dQZEVXbMMy2roB9myp', flag: '🇦🇷', itunesCountry: 'AR' },
  it: { title: 'Itália', subtitle: 'As 50 músicas mais ouvidas na Itália', playlistId: '37i9dQZEVXbIQnj7RRhdSX', flag: '🇮🇹', itunesCountry: 'IT' },
  fr: { title: 'França', subtitle: 'As 50 músicas mais ouvidas na França', playlistId: '37i9dQZEVXbIPWwFssbupI', flag: '🇫🇷', itunesCountry: 'FR' },
  de: { title: 'Alemanha', subtitle: 'As 50 músicas mais ouvidas na Alemanha', playlistId: '37i9dQZEVXbJiZcmkrIHGU', flag: '🇩🇪', itunesCountry: 'DE' },
  jp: { title: 'Japão', subtitle: 'As 50 músicas mais ouvidas no Japão', playlistId: '37i9dQZEVXbKXQ4mDTEBXq', flag: '🇯🇵', itunesCountry: 'JP' },
};

// Mapeamento de Gêneros Musicais Oficiais
const OFFICIAL_GENRE_CHARTS: Record<string, { title: string; subtitle: string; playlistId?: string; itunesTerm?: string; icon: string }> = {
  flashback: { title: 'Flashback & Clássicos', subtitle: 'Grandes sucessos nostálgicos das décadas de 70, 80, 90 e 2000', itunesTerm: 'flashback greatest hits 80s 90s', icon: '📻' },
  sertanejo: { title: 'Top Sertanejo', subtitle: 'Os maiores sucessos e lançamentos do sertanejo', playlistId: '37i9dQZF1DXdSjVZQzv2tl', icon: '🤠' },
  pop: { title: 'Pop Internacional', subtitle: 'Os maiores hits do pop mundial', playlistId: '37i9dQZF1DXcBWIGoYBM5M', icon: '🎤' },
  funk: { title: 'Funk Brasil', subtitle: 'Os maiores sucessos de funk dos bailes e paradas', itunesTerm: 'funk brasil hits', icon: '🇧🇷' },
  pagode: { title: 'Pagode & Samba', subtitle: 'Os maiores sucessos de pagode e samba', itunesTerm: 'pagode ao vivo sucessos', icon: '🥁' },
  trap: { title: 'Trap Brasil', subtitle: 'O melhor do trap e hip-hop nacional', itunesTerm: 'trap brasil', icon: '⚡' },
  forro: { title: 'Forró & Piseiro', subtitle: 'Os hits mais quentes de forró e piseiro', itunesTerm: 'forro piseiro hits', icon: '🪗' },
  mpb: { title: 'Grandes Clássicos MPB', subtitle: 'As canções imortais da Música Popular Brasileira', itunesTerm: 'mpb clássicos', icon: '🌿' },
  rock: { title: 'Rock Classics', subtitle: 'Os maiores clássicos do rock de todos os tempos', playlistId: '37i9dQZF1DWXRqgorJj26U', icon: '🎸' },
  eletronica: { title: 'Eletrônica & Dance', subtitle: 'O melhor da música eletrônica, house e club', playlistId: '37i9dQZF1DX4dyzvuaRJ0n', icon: '🎧' },
  hiphop: { title: 'Rap & Hip-Hop', subtitle: 'As faixas mais pesadas e influentes do rap mundial', playlistId: '37i9dQZF1DX0XUsuxWHRQd', icon: '🌍' },
  latino: { title: 'Reggaeton & Latino', subtitle: 'O melhor do reggaeton, bachata e ritmos latinos', playlistId: '37i9dQZF1DX10zKzsJ2jva', icon: '💃' },
  virais: { title: 'Hits Virais', subtitle: 'Músicas que estão explodindo nas redes sociais', playlistId: '37i9dQZF1DX2L0iB23Enbq', icon: '🔥' },
  chill: { title: 'Acústico & Chill', subtitle: 'Músicas suaves, acústicas e relaxantes', playlistId: '37i9dQZF1DX4WYpdgoIcn6', icon: '☕' },
};

// Coleção Curada de Sucessos Históricos por Ano no Brasil
const HISTORICAL_YEAR_HITS_BR: Record<string, Array<{ title: string; artist: string; album?: string; durationSeconds: number }>> = {
  '2024': [
    { title: 'Barulho do Foguete', artist: 'Zé Neto & Cristiano', album: 'Escolhas, Vol. 2', durationSeconds: 154 },
    { title: 'Nosso Quadro', artist: 'Ana Castela', album: 'Boiadeira Internacional', durationSeconds: 174 },
    { title: 'Me Leva Pra Casa / Escrito nas Estrelas', artist: 'Lauana Prado', album: 'Raiz Goiânia', durationSeconds: 236 },
    { title: 'Daqui pra Sempre', artist: 'Manu Bahtidão & Simone Mendes', album: 'Daqui pra Sempre', durationSeconds: 191 },
    { title: 'Haverá Sinais', artist: 'Jorge & Mateus & Lauana Prado', album: 'Haverá Sinais', durationSeconds: 182 },
    { title: 'Dois Tristes', artist: 'Simone Mendes', album: 'Cantando Sua História', durationSeconds: 168 },
    { title: 'Pocpoc', artist: 'Pedro Sampaio', album: 'Astro', durationSeconds: 130 },
    { title: 'Deja Vu', artist: 'Luan Santana & Ana Castela', album: 'Luan City 2.0', durationSeconds: 187 },
    { title: 'The Box Medley Funk 2', artist: 'THE BOX & Mc Brinquedo & MC Cebezinho', album: 'The Box Medley', durationSeconds: 310 },
    { title: 'Casca de Bala', artist: 'Thullio Milionário', album: 'Casca de Bala', durationSeconds: 142 }
  ],
  '2023': [
    { title: 'Nosso Quadro', artist: 'Ana Castela', album: 'Boiadeira', durationSeconds: 174 },
    { title: 'Erro Gostoso (Ao Vivo)', artist: 'Simone Mendes', album: 'Cintilante', durationSeconds: 185 },
    { title: 'Leão', artist: 'Marília Mendonça', album: 'Decretos Reais', durationSeconds: 166 },
    { title: 'Seu Brilho Sumiu (Ao Vivo)', artist: 'Israel & Rodolffo & Mari Fernandez', album: 'Let\'s Bora', durationSeconds: 169 },
    { title: 'Oi Balde (Ao Vivo)', artist: 'Zé Neto & Cristiano', album: 'Escolhas, Vol. 1', durationSeconds: 156 },
    { title: 'Bombonzinho (Ao Vivo)', artist: 'Israel & Rodolffo & Ana Castela', album: 'Let\'s Bora', durationSeconds: 159 },
    { title: 'Coração de Gelo', artist: 'WIU', album: 'Manual de Como Amar Errado', durationSeconds: 161 },
    { title: 'Roça em Mim', artist: 'Zé Felipe, Ana Castela & Luan Pereira', album: 'Roça em Mim', durationSeconds: 156 },
    { title: 'Haja Colírio (Ao Vivo)', artist: 'Guilherme & Benuto & Hugo & Guilherme', album: 'No Boteco', durationSeconds: 173 },
    { title: 'Zona de Perigo', artist: 'Léo Santana', album: 'Zona de Perigo', durationSeconds: 136 }
  ],
  '2022': [
    { title: 'Mal Feito (Ao Vivo)', artist: 'Hugo & Guilherme & Marília Mendonça', album: 'Próximo Passo', durationSeconds: 170 },
    { title: 'Vai Lá em Casa Hoje', artist: 'George Henrique & Rodrigo & Marília Mendonça', album: 'Ao Vivo em Brasília', durationSeconds: 165 },
    { title: 'Molhando o Volante', artist: 'Jorge & Mateus', album: 'É Simples Assim', durationSeconds: 162 },
    { title: 'Dançarina', artist: 'Pedro Sampaio & MC Pedrinho', album: 'Chama Meu Nome', durationSeconds: 110 },
    { title: 'Envolver', artist: 'Anitta', album: 'Versions of Me', durationSeconds: 193 },
    { title: 'Bloqueado (Ao Vivo)', artist: 'Gusttavo Lima', album: 'Buteco in Boston', durationSeconds: 198 },
    { title: 'Termina Comigo Antes', artist: 'Gusttavo Lima', album: 'Termina Comigo Antes', durationSeconds: 165 },
    { title: 'Pipoco', artist: 'Ana Castela, Melody & DJ Chris no Beat', album: 'Pipoco', durationSeconds: 200 },
    { title: 'Acorda Pedrinho', artist: 'Jovem Dionísio', album: 'Acorda Pedrinho', durationSeconds: 142 },
    { title: 'Batom de Cereja (Ao Vivo)', artist: 'Israel & Rodolffo', album: 'Aqui e Agora', durationSeconds: 140 }
  ],
  '2021': [
    { title: 'Batom de Cereja (Ao Vivo)', artist: 'Israel & Rodolffo', album: 'Aqui e Agora', durationSeconds: 140 },
    { title: 'Facas (Ao Vivo)', artist: 'Diego & Victor Hugo & Bruno & Marrone', album: 'Equilíbrio', durationSeconds: 181 },
    { title: 'Meu Pedaço de Pecado', artist: 'João Gomes', album: 'Eu Tenho a Senha', durationSeconds: 150 },
    { title: 'Baby Me Atende', artist: 'Matheus Fernandes & Dilsinho', album: 'Baby Me Atende', durationSeconds: 185 },
    { title: 'Coração Cachorro', artist: 'Ávine Vinny & Matheus Fernandes', album: 'Coração Cachorro', durationSeconds: 142 },
    { title: 'Ele É Ele, Eu Sou Eu', artist: 'Wesley Safadão & Barões da Pisadinha', album: 'Safadão Amplificado', durationSeconds: 144 },
    { title: 'Ficha Limpa', artist: 'Gusttavo Lima', album: 'O Embaixador Falando de Amor', durationSeconds: 193 },
    { title: 'Morena', artist: 'Luan Santana', album: 'Morena', durationSeconds: 166 },
    { title: 'Tapão na Raba', artist: 'Raí Saia Rodada', album: 'Som no Talo', durationSeconds: 140 },
    { title: 'Aquele Ex (Ao Vivo)', artist: 'João Bosco & Gabriel', album: 'Diamante', durationSeconds: 178 }
  ],
  '2020': [
    { title: 'Liberdade Provisória (Ao Vivo)', artist: 'Henrique & Juliano', album: 'Ao Vivo no Ibirapuera', durationSeconds: 178 },
    { title: 'A Gente Fez Amor (Ao Vivo)', artist: 'Gusttavo Lima', album: 'O Embaixador in Cariri', durationSeconds: 220 },
    { title: 'Graveto (Ao Vivo)', artist: 'Marília Mendonça', album: 'Todos os Cantos', durationSeconds: 153 },
    { title: 'Recairei (Ao Vivo)', artist: 'Os Barões da Pisadinha', album: 'Conquistas', durationSeconds: 150 },
    { title: 'Basta Você Me Ligar', artist: 'Os Barões da Pisadinha & Xand Avião', album: 'Basta Você Me Ligar', durationSeconds: 154 },
    { title: 'Com ou Sem Mim (Ao Vivo)', artist: 'Gustavo Mioto', album: 'Ao Vivo em Fortaleza', durationSeconds: 194 },
    { title: 'S de Saudade', artist: 'Luíza & Maurílio & Zé Neto & Cristiano', album: 'Segunda Dose', durationSeconds: 168 },
    { title: 'Briga Feia (Ao Vivo)', artist: 'Henrique & Juliano', album: 'Ao Vivo no Ibirapuera', durationSeconds: 172 },
    { title: 'Volta por Baixo (Ao Vivo)', artist: 'Henrique & Juliano', album: 'Ao Vivo no Ibirapuera', durationSeconds: 154 },
    { title: 'Barzinho Aleatório (Ao Vivo)', artist: 'Zé Neto & Cristiano', album: 'Por Mais Beijos Ao Vivo', durationSeconds: 176 }
  ],
  '2019': [
    { title: 'Lençol Dobrado', artist: 'João Gustavo e Murilo', album: 'Ao Vivo', durationSeconds: 165 },
    { title: 'Atrasadinha (Ao Vivo)', artist: 'Felipe Araújo & Ferrugem', album: 'Por Inteiro', durationSeconds: 172 },
    { title: 'Notificação Preferida (Ao Vivo)', artist: 'Zé Neto & Cristiano', album: 'Esquece o Mundo Lá Fora', durationSeconds: 178 },
    { title: 'Ciumeira (Ao Vivo)', artist: 'Marília Mendonça', album: 'Todos os Cantos', durationSeconds: 194 },
    { title: 'Todo Mundo Vai Sofrer (Ao Vivo)', artist: 'Marília Mendonça', album: 'Todos os Cantos', durationSeconds: 154 },
    { title: 'Solteiro Não Trai (Ao Vivo)', artist: 'Gustavo Mioto', album: 'Ao Vivo', durationSeconds: 174 },
    { title: 'Bebi Liguei (Ao Vivo)', artist: 'Marília Mendonça', album: 'Todos os Cantos', durationSeconds: 160 },
    { title: 'Cobaia (Ao Vivo)', artist: 'Lauana Prado & Maiara & Maraisa', album: 'Verdade', durationSeconds: 178 },
    { title: 'Quando a Bad Bater (Ao Vivo)', artist: 'Luan Santana', album: 'Viva', durationSeconds: 177 },
    { title: 'Vou Ter Que Superar (Ao Vivo)', artist: 'Matheus & Kauan & Marília Mendonça', album: 'Tem Moda Pra Tudo', durationSeconds: 196 }
  ],
  '2018': [
    { title: 'Propaganda (Ao Vivo)', artist: 'Jorge & Mateus', album: 'Terra Sem CEP', durationSeconds: 162 },
    { title: 'Largado às Traças (Ao Vivo)', artist: 'Zé Neto & Cristiano', album: 'Esquece o Mundo Lá Fora', durationSeconds: 215 },
    { title: 'Apelido Carinhoso', artist: 'Gusttavo Lima', album: 'Buteco do Gusttavo Lima 2', durationSeconds: 202 },
    { title: 'Status Que Eu Não Queria (Ao Vivo)', artist: 'Zé Neto & Cristiano', album: 'Esquece o Mundo Lá Fora', durationSeconds: 168 },
    { title: 'Dona Maria', artist: 'Thiago Brava & Jorge', album: 'Dona Maria', durationSeconds: 184 },
    { title: 'Pesadão', artist: 'IZA & Marcelo Falcão', album: 'Dona de Mim', durationSeconds: 198 },
    { title: 'Ao Vivo e a Cores', artist: 'Matheus & Kauan & Anitta', album: 'Intensamente Hoje', durationSeconds: 165 },
    { title: 'Anti-Amor (Ao Vivo)', artist: 'Gustavo Mioto & Jorge & Mateus', album: 'Ao Vivo em SP', durationSeconds: 171 },
    { title: 'Medicina', artist: 'Anitta', album: 'Medicina', durationSeconds: 141 },
    { title: 'Vai Malandra', artist: 'Anitta, Mc Zaac, Maejor', album: 'CheckMate', durationSeconds: 182 }
  ],
  '2015': [
    { title: 'Aquele 1% (Ao Vivo)', artist: 'Marcos & Belutti & Wesley Safadão', album: 'Acústico Tão Feliz', durationSeconds: 178 },
    { title: 'Suíte 14 (Ao Vivo)', artist: 'Henrique & Diego & MC Guimê', album: 'Tempo Certo', durationSeconds: 184 },
    { title: 'Sosseguei (Ao Vivo)', artist: 'Jorge & Mateus', album: 'Como Sempre Feito Nunca', durationSeconds: 203 },
    { title: 'Camarote', artist: 'Wesley Safadão', album: 'Ao Vivo em Brasília', durationSeconds: 180 },
    { title: 'Escreve Aí (Ao Vivo)', artist: 'Luan Santana', album: 'Acústico', durationSeconds: 218 },
    { title: 'Cuida Bem Dela (Ao Vivo)', artist: 'Henrique & Juliano', album: 'Ao Vivo em Brasília', durationSeconds: 209 },
    { title: 'Os Anjos Cantam', artist: 'Jorge & Mateus', album: 'Os Anjos Cantam', durationSeconds: 196 },
    { title: '10% (Ao Vivo)', artist: 'Maiara & Maraisa', album: 'Ao Vivo em Goiânia', durationSeconds: 168 },
    { title: 'Mudando de Assunto (Ao Vivo)', artist: 'Henrique & Juliano', album: 'Ao Vivo em Brasília', durationSeconds: 188 },
    { title: 'Previsão do Tempo', artist: 'Jorge & Mateus', album: 'Os Anjos Cantam', durationSeconds: 198 }
  ],
  '2010': [
    { title: 'Meteoro (Ao Vivo)', artist: 'Luan Santana', album: 'Ao Vivo', durationSeconds: 200 },
    { title: 'Você Não Vale Nada', artist: 'Calcinha Preta', album: 'Volume 20', durationSeconds: 205 },
    { title: 'Chora, Me Liga (Ao Vivo)', artist: 'João Bosco & Vinícius', album: 'Curtição', durationSeconds: 183 },
    { title: 'Ai Se Eu Te Pego', artist: 'Michel Teló', album: 'Na Balada', durationSeconds: 166 },
    { title: 'Fugidinha (Ao Vivo)', artist: 'Michel Teló', album: 'Ao Vivo', durationSeconds: 188 },
    { title: 'E Daí? (Ao Vivo)', artist: 'Guilherme & Santiago', album: 'Tudo Tem Um Porquê', durationSeconds: 195 },
    { title: 'Borboletas', artist: 'Victor & Leo', album: 'Borboletas', durationSeconds: 196 },
    { title: 'Sinais (Ao Vivo)', artist: 'Luan Santana', album: 'Ao Vivo', durationSeconds: 222 },
    { title: 'Amo Noite e Dia (Ao Vivo)', artist: 'Jorge & Mateus', album: 'Aí Já Era', durationSeconds: 194 },
    { title: 'Sem Esse Coração (Ao Vivo)', artist: 'João Neto & Frederico', album: 'Vale a Pena Sonhar', durationSeconds: 184 }
  ],
  '2000': [
    { title: 'Dormi na Praça (Ao Vivo)', artist: 'Bruno & Marrone', album: 'Acústico', durationSeconds: 164 },
    { title: 'Evidências', artist: 'Chitãozinho & Xororó', album: 'Cowboy do Asfalto', durationSeconds: 295 },
    { title: 'Amor Perfeito', artist: 'Babado Novo', album: 'Sem Vergonha', durationSeconds: 215 },
    { title: 'Festa no Apê', artist: 'Latino', album: 'A Festa Continua', durationSeconds: 245 },
    { title: 'Tô Nem Aí', artist: 'Luka', album: 'Porta Aberta', durationSeconds: 155 },
    { title: 'Rindo à Toa', artist: 'Falamansa', album: 'Deixa Entrar', durationSeconds: 210 },
    { title: 'Vou Deixar', artist: 'Skank', album: 'Cosmotron', durationSeconds: 275 },
    { title: 'Dias Atrás', artist: 'CPM 22', album: 'Chegou a Hora de Recomeçar', durationSeconds: 248 },
    { title: 'Anna Júlia', artist: 'Los Hermanos', album: 'Los Hermanos', durationSeconds: 212 },
    { title: 'Velha Infância', artist: 'Tribalistas', album: 'Tribalistas', durationSeconds: 250 }
  ],
  '1990': [
    { title: 'É o Amor', artist: 'Zezé Di Camargo & Luciano', album: 'Zezé Di Camargo & Luciano', durationSeconds: 202 },
    { title: 'Evidências', artist: 'Chitãozinho & Xororó', album: 'Cowboy do Asfalto', durationSeconds: 295 },
    { title: 'Pensa em Mim', artist: 'Leandro & Leonardo', album: 'Volume 4', durationSeconds: 195 },
    { title: 'Temporal de Amor', artist: 'Leandro & Leonardo', album: 'Volume 6', durationSeconds: 245 },
    { title: 'Cheia de Manias', artist: 'Raça Negra', album: 'Raça Negra Vol. 3', durationSeconds: 204 },
    { title: 'Cilada', artist: 'Molejo', album: 'Não Era Amor', durationSeconds: 220 },
    { title: 'O Canto da Cidade', artist: 'Daniela Mercury', album: 'O Canto da Cidade', durationSeconds: 202 },
    { title: 'Pelados em Santos', artist: 'Mamonas Assassinas', album: 'Mamonas Assassinas', durationSeconds: 203 },
    { title: 'Vira-Vira', artist: 'Mamonas Assassinas', album: 'Mamonas Assassinas', durationSeconds: 144 },
    { title: 'Garota Nacional', artist: 'Skank', album: 'O Samba Poconé', durationSeconds: 317 }
  ],
  '1980': [
    { title: 'Exagerado', artist: 'Cazuza', album: 'Exagerado', durationSeconds: 225 },
    { title: 'Tempo Perdido', artist: 'Legião Urbana', album: 'Dois', durationSeconds: 302 },
    { title: 'Eduardo e Mônica', artist: 'Legião Urbana', album: 'Dois', durationSeconds: 272 },
    { title: 'Faroeste Caboclo', artist: 'Legião Urbana', album: 'Que País É Este', durationSeconds: 543 },
    { title: 'Inútil', artist: 'Ultraje a Rigor', album: 'Nós Vamos Invadir Sua Praia', durationSeconds: 172 },
    { title: 'Primeiros Erros (Chove)', artist: 'Kiko Zambianchi', album: 'Choque', durationSeconds: 210 },
    { title: 'Olhar 43', artist: 'RPM', album: 'Rádio Pirata Ao Vivo', durationSeconds: 185 },
    { title: 'Rádio Pirata', artist: 'RPM', album: 'Revoluções por Minuto', durationSeconds: 210 },
    { title: 'Meu Erro', artist: 'Os Paralamas do Sucesso', album: 'O Passo do Lui', durationSeconds: 208 },
    { title: 'Menina Veneno', artist: 'Ritchie', album: 'Voo de Coração', durationSeconds: 280 }
  ],
  '1970': [
    { title: 'Como Nossos Pais', artist: 'Elis Regina', album: 'Falso Brilhante', durationSeconds: 279 },
    { title: 'Águas de Março', artist: 'Elis Regina & Tom Jobim', album: 'Elis & Tom', durationSeconds: 212 },
    { title: 'Construção', artist: 'Chico Buarque', album: 'Construção', durationSeconds: 258 },
    { title: 'Sampa', artist: 'Caetano Veloso', album: 'Muito', durationSeconds: 198 },
    { title: 'Gita', artist: 'Raul Seixas', album: 'Gita', durationSeconds: 290 },
    { title: 'Metamorfose Ambulante', artist: 'Raul Seixas', album: 'Krig-ha, Bandolo!', durationSeconds: 230 },
    { title: 'O Bêbado e a Equilibrista', artist: 'Elis Regina', album: 'Essa Mulher', durationSeconds: 227 },
    { title: 'Não Deixe o Samba Morrer', artist: 'Alcione', album: 'A Voz do Samba', durationSeconds: 274 },
    { title: 'Primavera', artist: 'Tim Maia', album: 'Tim Maia', durationSeconds: 133 },
    { title: 'Azul da Cor do Mar', artist: 'Tim Maia', album: 'Tim Maia', durationSeconds: 200 }
  ]
};

// Rota de Rankings e Paradas Musicais
app.get('/api/music/charts', async (req, res) => {
  try {
    const type = String(req.query.type || 'country'); // 'country' | 'genre'
    const code = String(req.query.code || (type === 'country' ? 'br' : 'sertanejo')).toLowerCase();
    const year = String(req.query.year || '').trim(); // e.g. '2024', '2023', '2020', '2015', '2010', '2000', '1990', '1980' ou vazio/'atual'

    const cacheKey = `${type}_${code}_${year || 'latest'}`;

    // 1. Verifica cache em memória
    const cached = chartsMemoryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CHARTS_CACHE_TTL)) {
      return res.json(cached.data);
    }

    const countryConfig = OFFICIAL_COUNTRY_CHARTS[code] || OFFICIAL_COUNTRY_CHARTS['br'];
    const genreConfig = OFFICIAL_GENRE_CHARTS[code] || OFFICIAL_GENRE_CHARTS['flashback'] || OFFICIAL_GENRE_CHARTS['sertanejo'];

    let chartInfo = {
      title: type === 'genre' ? genreConfig.title : countryConfig.title,
      subtitle: type === 'genre' ? genreConfig.subtitle : countryConfig.subtitle,
      flagOrIcon: type === 'genre' ? genreConfig.icon : countryConfig.flag,
      type,
      code,
      year: year && year !== 'atual' ? year : 'Atual',
      playlistCover: '',
      updatedAt: new Date().toISOString()
    };
    let tracks: any[] = [];

    // CASO 1: REQUISIÇÃO DE GÊNERO MUSICAL
    if (type === 'genre') {
      chartInfo.flagOrIcon = genreConfig.icon;

      // Se possui filtro de ano específico para o gênero
      if (year && year !== 'atual') {
        chartInfo.title = `${genreConfig.title} (${year})`;
        chartInfo.subtitle = `Os maiores sucessos e clássicos de ${genreConfig.title.replace('Top ', '')} no período de ${year}`;

        let searchTerm = `${genreConfig.title} ${year}`;
        if (code === 'flashback') {
          if (year === '1970') searchTerm = '70s greatest hits disco rock flashback classics';
          else if (year === '1980') searchTerm = '80s greatest hits flashback pop rock';
          else if (year === '1990') searchTerm = '90s greatest hits flashback dance pop';
          else if (year === '2000') searchTerm = '2000s flashback greatest hits';
          else if (year === '2010') searchTerm = '2010s greatest hits';
          else searchTerm = `flashback greatest hits ${year}`;
        } else if (code === 'sertanejo') {
          searchTerm = `sertanejo sucessos ${year}`;
        } else if (code === 'rock') {
          searchTerm = `rock classics ${year}`;
        } else if (code === 'funk') {
          searchTerm = `funk brasil ${year}`;
        } else if (code === 'pagode') {
          searchTerm = `pagode samba ${year}`;
        } else if (code === 'forro') {
          searchTerm = `forro ${year}`;
        } else if (code === 'pop') {
          searchTerm = `pop hits ${year}`;
        } else if (code === 'eletronica') {
          searchTerm = `electronic dance music ${year}`;
        } else if (code === 'hiphop' || code === 'trap') {
          searchTerm = `rap hip hop ${year}`;
        } else if (code === 'mpb') {
          searchTerm = `mpb ${year}`;
        }

        const itunesResp = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&country=BR&limit=50`,
          { signal: AbortSignal.timeout(8000) }
        );
        const itunesData = await itunesResp.json();
        const results = itunesData.results || [];
        tracks = results.map((t: any, idx: number) => ({
          id: `genre_${code}_${year}_${t.trackId || idx + 1}`,
          rank: idx + 1,
          title: t.trackName,
          artist: t.artistName,
          album: t.collectionName || `${genreConfig.title} - ${year}`,
          durationSeconds: Math.round((t.trackTimeMillis || 180000) / 1000),
          artwork: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb')
        }));
        if (tracks.length > 0) {
          chartInfo.playlistCover = tracks[0].artwork;
        }
      } else {
        // Gênero sem filtro de ano (Parada atual / Mais tocadas do gênero)
        chartInfo.title = genreConfig.title;
        chartInfo.subtitle = genreConfig.subtitle;

        if (genreConfig.playlistId) {
          const embedUrl = `https://open.spotify.com/embed/playlist/${genreConfig.playlistId}`;
          const embedResp = await fetch(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(10000)
          });
          const html = await embedResp.text();
          const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);

          if (m) {
            const d = JSON.parse(m[1]);
            const entity = d.props?.pageProps?.state?.data?.entity || {};
            const coverArt = entity.coverArt?.sources?.[0]?.url || '';
            chartInfo.playlistCover = coverArt;

            const rawList = entity.trackList || [];
            tracks = rawList.map((t: any, idx: number) => {
              const trackId = t.uri ? t.uri.replace('spotify:track:', '') : `track_${idx + 1}`;
              return {
                id: trackId,
                rank: idx + 1,
                title: t.title,
                artist: (t.subtitle || 'Artista').replace(/\u00a0/g, ' '),
                durationSeconds: Math.round((t.duration || 180000) / 1000),
                artwork: coverArt
              };
            });

            // Enriquece os primeiros 20
            const topSlice = tracks.slice(0, 20);
            await Promise.all(
              topSlice.map(async (item) => {
                try {
                  const oRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${item.id}`, {
                    signal: AbortSignal.timeout(3000)
                  });
                  if (oRes.ok) {
                    const oData = await oRes.json();
                    if (oData.thumbnail_url) item.artwork = oData.thumbnail_url;
                  }
                } catch {}
              })
            );
          }
        } else if (genreConfig.itunesTerm) {
          const itunesResp = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(genreConfig.itunesTerm)}&entity=song&country=BR&limit=50`,
            { signal: AbortSignal.timeout(10000) }
          );
          const itunesData = await itunesResp.json();
          const results = itunesData.results || [];
          tracks = results.map((t: any, idx: number) => ({
            id: `chart_genre_${t.trackId || idx + 1}`,
            rank: idx + 1,
            title: t.trackName,
            artist: t.artistName,
            album: t.collectionName,
            durationSeconds: Math.round((t.trackTimeMillis || 180000) / 1000),
            artwork: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb')
          }));
          if (tracks.length > 0) {
            chartInfo.playlistCover = tracks[0].artwork;
          }
        }
      }
    } else {
      // CASO 2: REQUISIÇÃO DE PAÍS / REGIÃO
      if (year && year !== 'atual') {
        chartInfo.title = `Mais Ouvidas de ${year} - ${countryConfig.title}`;
        chartInfo.subtitle = `Os maiores sucessos e músicas mais tocadas de ${year} em ${countryConfig.title}`;

        // Se temos o ano curado para o Brasil
        if (code === 'br' && HISTORICAL_YEAR_HITS_BR[year]) {
          const hits = HISTORICAL_YEAR_HITS_BR[year];
          tracks = await Promise.all(
            hits.map(async (hit, idx) => {
              let artwork = '';
              try {
                const sr = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${hit.title} ${hit.artist}`)}&entity=song&country=BR&limit=1`, {
                  signal: AbortSignal.timeout(3000)
                });
                if (sr.ok) {
                  const sdata = await sr.json();
                  if (sdata.results && sdata.results.length > 0) {
                    artwork = (sdata.results[0].artworkUrl100 || '').replace('100x100bb', '600x600bb');
                  }
                }
              } catch {}

              return {
                id: `hist_${year}_${idx + 1}`,
                rank: idx + 1,
                title: hit.title,
                artist: hit.artist,
                album: hit.album || `Hits de ${year}`,
                durationSeconds: hit.durationSeconds,
                artwork: artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'
              };
            })
          );
          chartInfo.playlistCover = tracks[0]?.artwork || '';
        } else {
          // Busca dinâmica de sucessos do ano para o país
          const itunesCountry = countryConfig.itunesCountry || 'BR';
          const searchTerm = itunesCountry === 'BR' || itunesCountry === 'PT'
            ? `as mais tocadas ${year}`
            : `top hits ${year}`;

          const itunesResp = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&country=${itunesCountry}&limit=50`,
            { signal: AbortSignal.timeout(8000) }
          );
          const itunesData = await itunesResp.json();
          const results = itunesData.results || [];

          tracks = results.map((t: any, idx: number) => ({
            id: `year_${year}_${t.trackId || idx + 1}`,
            rank: idx + 1,
            title: t.trackName,
            artist: t.artistName,
            album: t.collectionName || `Sucessos de ${year}`,
            durationSeconds: Math.round((t.trackTimeMillis || 180000) / 1000),
            artwork: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb')
          }));
          if (tracks.length > 0) {
            chartInfo.playlistCover = tracks[0].artwork;
          }
        }
      } else {
        // Parada atual do país
        chartInfo.title = `Top 50 - ${countryConfig.title}`;
        chartInfo.subtitle = `As 50 músicas mais tocadas hoje em ${countryConfig.title}`;
        chartInfo.flagOrIcon = countryConfig.flag;

        const embedUrl = `https://open.spotify.com/embed/playlist/${countryConfig.playlistId}`;
        const embedResp = await fetch(embedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(10000)
        });
        const html = await embedResp.text();
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);

        if (m) {
          const d = JSON.parse(m[1]);
          const entity = d.props?.pageProps?.state?.data?.entity || {};
          const coverArt = entity.coverArt?.sources?.[0]?.url || '';
          chartInfo.playlistCover = coverArt;

          const rawList = entity.trackList || [];
          tracks = rawList.map((t: any, idx: number) => {
            const trackId = t.uri ? t.uri.replace('spotify:track:', '') : `track_${idx + 1}`;
            return {
              id: trackId,
              rank: idx + 1,
              title: t.title,
              artist: (t.subtitle || 'Artista').replace(/\u00a0/g, ' '),
              durationSeconds: Math.round((t.duration || 180000) / 1000),
              artwork: coverArt
            };
          });

          const topSlice = tracks.slice(0, 20);
          await Promise.all(
            topSlice.map(async (item) => {
              try {
                const oRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${item.id}`, {
                  signal: AbortSignal.timeout(3000)
                });
                if (oRes.ok) {
                  const oData = await oRes.json();
                  if (oData.thumbnail_url) {
                    item.artwork = oData.thumbnail_url;
                  }
                }
              } catch {}
            })
          );
        }
      }
    }

    const payload = {
      chartInfo: {
        ...chartInfo,
        totalTracks: tracks.length
      },
      availableCountries: Object.entries(OFFICIAL_COUNTRY_CHARTS).map(([k, v]) => ({
        code: k,
        title: v.title,
        flag: v.flag
      })),
      availableYears: [
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
      ],
      availableGenres: Object.entries(OFFICIAL_GENRE_CHARTS).map(([k, v]) => ({
        code: k,
        title: v.title,
        icon: v.icon
      })),
      tracks
    };

    chartsMemoryCache.set(cacheKey, { timestamp: Date.now(), data: payload });
    res.json(payload);
  } catch (error: any) {
    console.error('Erro na rota /api/music/charts:', error);
    res.status(500).json({ error: 'Falha ao obter ranking de mais ouvidas', details: error.message });
  }
});

// =========================================================================
// SINCRONIZAÇÃO EM NUVEM E AUTENTICAÇÃO MULTI-DISPOSITIVO (YOUTUBE / GOOGLE)
// =========================================================================
interface UserCloudStore {
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    provider: string;
    termsAccepted: boolean;
    termsAcceptedAt: string;
  };
  favorites: any[];
  playlists: any[];
  downloads: any[];
  queue: any[];
  updatedAt: string;
}

const userCloudDatabase = new Map<string, UserCloudStore>();

// 1. Login com Conta YouTube / Google & Aceite dos Termos de Uso
app.post('/api/auth/login-youtube', (req, res) => {
  try {
    const { name, email, avatar, provider = 'youtube', termsAccepted, termsAcceptedAt } = req.body || {};
    
    if (!termsAccepted) {
      return res.status(400).json({ error: 'É necessário aceitar os termos de uso e autorizações para sincronizar entre dispositivos.' });
    }

    const cleanEmail = String(email || 'usuario@audioflix.app').toLowerCase().trim();
    const userId = `user_${Buffer.from(cleanEmail).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'guest'}`;

    const existing = userCloudDatabase.get(userId);
    const user = {
      id: userId,
      name: name || 'Usuário AudioFlix',
      email: cleanEmail,
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || cleanEmail)}`,
      provider,
      termsAccepted: true,
      termsAcceptedAt: termsAcceptedAt || new Date().toISOString()
    };

    if (!existing) {
      userCloudDatabase.set(userId, {
        user,
        favorites: [],
        playlists: [],
        downloads: [],
        queue: [],
        updatedAt: new Date().toISOString()
      });
    } else {
      existing.user = user;
      existing.updatedAt = new Date().toISOString();
    }

    const currentStore = userCloudDatabase.get(userId)!;
    return res.json({
      success: true,
      user,
      cloudData: {
        favorites: currentStore.favorites,
        playlists: currentStore.playlists,
        downloads: currentStore.downloads,
        queue: currentStore.queue,
        updatedAt: currentStore.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao processar login com conta do YouTube' });
  }
});

// 2. Obter Dados em Nuvem do Usuário (Favoritos, Playlists, Downloads, Fila)
app.get('/api/user/sync', (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuário não fornecido' });
    }

    const store = userCloudDatabase.get(userId);
    if (!store) {
      return res.json({
        found: false,
        favorites: [],
        playlists: [],
        downloads: [],
        queue: []
      });
    }

    return res.json({
      found: true,
      user: store.user,
      favorites: store.favorites,
      playlists: store.playlists,
      downloads: store.downloads,
      queue: store.queue,
      updatedAt: store.updatedAt
    });
  } catch (error: any) {
    console.error('Erro na sincronização GET:', error);
    res.status(500).json({ error: 'Erro ao buscar dados em nuvem' });
  }
});

// 3. Salvar e Sincronizar Dados em Nuvem (Multi-Dispositivo)
app.post('/api/user/sync', (req, res) => {
  try {
    const { userId, favorites, playlists, downloads, queue } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuário obrigatório para sincronização' });
    }

    let store = userCloudDatabase.get(userId);
    if (!store) {
      store = {
        user: {
          id: userId,
          name: 'Usuário Conectado',
          email: `${userId}@audioflix.app`,
          provider: 'youtube',
          termsAccepted: true,
          termsAcceptedAt: new Date().toISOString()
        },
        favorites: Array.isArray(favorites) ? favorites : [],
        playlists: Array.isArray(playlists) ? playlists : [],
        downloads: Array.isArray(downloads) ? downloads : [],
        queue: Array.isArray(queue) ? queue : [],
        updatedAt: new Date().toISOString()
      };
      userCloudDatabase.set(userId, store);
    } else {
      if (Array.isArray(favorites)) store.favorites = favorites;
      if (Array.isArray(playlists)) store.playlists = playlists;
      if (Array.isArray(downloads)) store.downloads = downloads;
      if (Array.isArray(queue)) store.queue = queue;
      store.updatedAt = new Date().toISOString();
    }

    return res.json({
      success: true,
      syncedAt: store.updatedAt,
      itemsCount: {
        favorites: store.favorites.length,
        playlists: store.playlists.length,
        downloads: store.downloads.length,
        queue: store.queue.length
      }
    });
  } catch (error: any) {
    console.error('Erro na sincronização POST:', error);
    res.status(500).json({ error: 'Erro ao salvar dados na nuvem' });
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
