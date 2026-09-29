/**
 * AudioFix - Motor de Transcodificação e Reparo de Áudio (Client-Side)
 * 
 * Permite selecionar o formato de destino (MP3, WAV, FLAC, OGG, M4A).
 * Se o arquivo já estiver no formato desejado, executa extração direta
 * sem perda de qualidade (Stream Copy). Se precisar de conversão,
 * utiliza FFmpeg.wasm ou fallback Web Audio API.
 */

// @ts-ignore
import { Mp3Encoder } from '@breezystack/lamejs';

export type TargetFormat = 'mp3' | 'wav' | 'flac' | 'ogg' | 'm4a';
export type BitrateOption = 128 | 192 | 320;

export interface TranscodeProgress {
  ratio?: number;
  message?: string;
  stage: 'loading' | 'analyzing' | 'transcoding' | 'encoding' | 'completed' | 'error';
}

interface FFmpegInstance {
  load(): Promise<void>;
  isLoaded(): boolean;
  FS(method: 'writeFile', path: string, data: Uint8Array): void;
  FS(method: 'readFile', path: string): Uint8Array;
  FS(method: 'unlink', path: string): void;
  run(...args: string[]): Promise<void>;
  setProgress?(callback: (p: { ratio: number }) => void): void;
  setLogger?(callback: (log: { type: string; message: string }) => void): void;
}

let ffmpegSingleton: FFmpegInstance | null = null;
let ffmpegLoadingPromise: Promise<FFmpegInstance | null> | null = null;
let ffmpegLoadFailed = false;

export async function getFFmpegInstance(): Promise<FFmpegInstance | null> {
  if (ffmpegSingleton && ffmpegSingleton.isLoaded()) {
    return ffmpegSingleton;
  }

  if (ffmpegLoadFailed) {
    return null;
  }

  if (ffmpegLoadingPromise) {
    return ffmpegLoadingPromise;
  }

  ffmpegLoadingPromise = (async () => {
    try {
      const globalFFmpeg = (window as unknown as { FFmpeg?: { createFFmpeg: (options: object) => FFmpegInstance } }).FFmpeg;
      let createFFmpegFn = globalFFmpeg?.createFFmpeg;

      if (!createFFmpegFn) {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector('script[src*="ffmpeg.min.js"]');
          if (existingScript) {
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () => reject(new Error('Falha ao carregar script do FFmpeg')));
            if ((window as unknown as { FFmpeg?: unknown }).FFmpeg) return resolve();
          } else {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('CDN do FFmpeg inacessível'));
            document.head.appendChild(script);
          }
        });
        const reloaded = (window as unknown as { FFmpeg?: { createFFmpeg: (options: object) => FFmpegInstance } }).FFmpeg;
        createFFmpegFn = reloaded?.createFFmpeg;
      }

      if (!createFFmpegFn) {
        throw new Error('FFmpeg createFFmpeg não encontrado');
      }

      const instance = createFFmpegFn({
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
      });

      await instance.load();
      ffmpegSingleton = instance;
      return instance;
    } catch (err) {
      console.warn('FFmpeg.wasm não pôde ser inicializado. Usando pipeline WebAudio nativo.', err);
      ffmpegLoadFailed = true;
      return null;
    }
  })();

  return ffmpegLoadingPromise;
}

/**
 * Converte ou repara um arquivo para o formato desejado
 * @param file Arquivo original
 * @param targetFormat Formato final desejado ('mp3' | 'wav' | 'flac' | 'ogg' | 'm4a')
 * @param bitrate Taxa de bits caso seja MP3 ou M4A
 * @param directRepack Se true, o arquivo já está no formato certo e apenas precisa de nova embalagem/extensão limpa
 */
export async function transcodeAudio(
  file: File,
  targetFormat: TargetFormat = 'mp3',
  bitrate: BitrateOption = 192,
  directRepack: boolean = false,
  inputExtHint?: string,
  onProgress?: (progress: TranscodeProgress) => void
): Promise<{ blob: Blob; engineUsed: 'ffmpeg' | 'webaudio' | 'stream_copy' }> {
  // 1. Caso seja Repack Direto (já era MP3/WAV internamente): Preserva 100% da qualidade original sem re-encoding
  if (directRepack) {
    onProgress?.({ stage: 'completed', message: 'Preservando qualidade original (Stream Copy)...', ratio: 1 });
    const mimeMap: Record<TargetFormat, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4'
    };
    const cleanBlob = new Blob([file], { type: mimeMap[targetFormat] || 'application/octet-stream' });
    return { blob: cleanBlob, engineUsed: 'stream_copy' };
  }

  onProgress?.({ stage: 'loading', message: 'Preparando motor de áudio...' });

  const ffmpeg = await getFFmpegInstance();

  // 2. Se o FFmpeg.wasm estiver ativo
  if (ffmpeg && ffmpeg.isLoaded()) {
    try {
      return await runFFmpegConversion(ffmpeg, file, targetFormat, bitrate, inputExtHint, onProgress);
    } catch (ffmpegErr) {
      console.warn('FFmpeg falhou, tentando decodificador nativo Web Audio:', ffmpegErr);
      onProgress?.({ stage: 'analyzing', message: 'Alternando para decodificador nativo...' });
      return await runWebAudioConversion(file, targetFormat, bitrate, onProgress);
    }
  }

  // 3. Fallback Web Audio
  return await runWebAudioConversion(file, targetFormat, bitrate, onProgress);
}

/**
 * Conversão com FFmpeg.wasm
 */
async function runFFmpegConversion(
  ffmpeg: FFmpegInstance,
  file: File,
  targetFormat: TargetFormat,
  bitrate: BitrateOption,
  inputExtHint?: string,
  onProgress?: (progress: TranscodeProgress) => void
): Promise<{ blob: Blob; engineUsed: 'ffmpeg' }> {
  const safeTimestamp = Date.now();
  // Usa a extensão do container detectado (ex: .m4a, .aac, .mp3, .wav) para que o demuxer do FFmpeg funcione perfeitamente
  const cleanHint = (inputExtHint || '').replace(/^\./, '').toLowerCase() || 'raw';
  const inputFileName = `input_${safeTimestamp}.${cleanHint}`;
  const outputFileName = `output_${safeTimestamp}.${targetFormat}`;

  onProgress?.({ stage: 'analyzing', message: 'Carregando arquivo na memória virtual (MEMFS)...' });

  const arrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  ffmpeg.FS('writeFile', inputFileName, fileData);

  onProgress?.({ stage: 'transcoding', message: `Convertendo para ${targetFormat.toUpperCase()}...`, ratio: 0.1 });

  if (ffmpeg.setProgress) {
    ffmpeg.setProgress(({ ratio }) => {
      onProgress?.({
        stage: 'transcoding',
        message: `Progresso: ${Math.round(ratio * 100)}%`,
        ratio: Math.min(Math.max(ratio, 0.1), 0.95)
      });
    });
  }

  try {
    // Monta argumentos do FFmpeg dependendo do formato de destino
    const args: string[] = ['-i', inputFileName];

    if (targetFormat === 'mp3') {
      args.push('-b:a', `${bitrate}k`, '-vn', outputFileName);
    } else if (targetFormat === 'wav') {
      args.push('-c:a', 'pcm_s16le', '-vn', outputFileName);
    } else if (targetFormat === 'flac') {
      args.push('-c:a', 'flac', '-vn', outputFileName);
    } else if (targetFormat === 'ogg') {
      args.push('-c:a', 'libvorbis', '-q:a', '5', '-vn', outputFileName);
    } else if (targetFormat === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', `${bitrate}k`, '-vn', outputFileName);
    }

    await ffmpeg.run(...args);

    onProgress?.({ stage: 'encoding', message: 'Extraindo arquivo convertido...', ratio: 0.98 });

    const outputData = ffmpeg.FS('readFile', outputFileName);
    const cleanUint8 = new Uint8Array(outputData);

    const mimeMap: Record<TargetFormat, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4'
    };

    const blob = new Blob([cleanUint8], { type: mimeMap[targetFormat] });

    onProgress?.({ stage: 'completed', message: 'Concluído com sucesso!', ratio: 1 });

    return { blob, engineUsed: 'ffmpeg' };
  } finally {
    try { ffmpeg.FS('unlink', inputFileName); } catch (_) {}
    try { ffmpeg.FS('unlink', outputFileName); } catch (_) {}
  }
}

/**
 * Fallback nativo Web Audio
 */
async function runWebAudioConversion(
  file: File,
  targetFormat: TargetFormat,
  bitrate: BitrateOption,
  onProgress?: (progress: TranscodeProgress) => void
): Promise<{ blob: Blob; engineUsed: 'webaudio' }> {
  onProgress?.({ stage: 'analyzing', message: 'Decodificando ondas sonoras via Web Audio...' });
  const arrayBuffer = await file.arrayBuffer();

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr) {
    await audioCtx.close();
    throw new Error('Não foi possível decodificar os dados de áudio.');
  }

  // Se o destino for WAV
  if (targetFormat === 'wav') {
    onProgress?.({ stage: 'encoding', message: 'Gerando arquivo WAV PCM...', ratio: 0.8 });
    const wavBlob = audioBufferToWav(audioBuffer);
    await audioCtx.close();
    onProgress?.({ stage: 'completed', message: 'Concluído!', ratio: 1 });
    return { blob: wavBlob, engineUsed: 'webaudio' };
  }

  // Se o destino for MP3 (ou fallback para MP3 caso outros formatos não tenham encoder JS puro)
  onProgress?.({ stage: 'encoding', message: `Codificando MP3 (${bitrate} kbps)...`, ratio: 0.2 });

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  // Inicializa o encoder MP3 moderno sem erro de MPEGMode
  const mp3encoder = new Mp3Encoder(numChannels > 1 ? 2 : 1, sampleRate, bitrate);
  const mp3Data: Uint8Array[] = [];

  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

  const sampleBlockSize = 1152;
  const leftInt16 = new Int16Array(sampleBlockSize);
  const rightInt16 = new Int16Array(sampleBlockSize);

  let processed = 0;

  for (let i = 0; i < length; i += sampleBlockSize) {
    const chunkSize = Math.min(sampleBlockSize, length - i);

    for (let j = 0; j < chunkSize; j++) {
      const l = leftChannel[i + j];
      const r = rightChannel[i + j];
      leftInt16[j] = l < 0 ? Math.max(-32768, Math.floor(l * 32768)) : Math.min(32767, Math.floor(l * 32767));
      rightInt16[j] = r < 0 ? Math.max(-32768, Math.floor(r * 32768)) : Math.min(32767, Math.floor(r * 32767));
    }

    let mp3buf: Uint8Array | Int8Array;
    if (numChannels > 1) {
      mp3buf = mp3encoder.encodeBuffer(leftInt16.subarray(0, chunkSize), rightInt16.subarray(0, chunkSize));
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftInt16.subarray(0, chunkSize));
    }

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.byteLength));
    }

    processed += chunkSize;
    if (i % (sampleBlockSize * 10) === 0) {
      const ratio = 0.2 + (processed / length) * 0.75;
      onProgress?.({
        stage: 'encoding',
        message: `Codificando MP3: ${Math.round((processed / length) * 100)}%`,
        ratio
      });
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const finalMp3buf = mp3encoder.flush();
  if (finalMp3buf.length > 0) {
    mp3Data.push(new Uint8Array(finalMp3buf.buffer, finalMp3buf.byteOffset, finalMp3buf.byteLength));
  }

  await audioCtx.close();

  const totalLength = mp3Data.reduce((acc, cur) => acc + cur.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Data) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const mp3Blob = new Blob([combined.buffer], { type: 'audio/mpeg' });
  onProgress?.({ stage: 'completed', message: 'Concluído com sucesso!', ratio: 1 });

  return { blob: mp3Blob, engineUsed: 'webaudio' };
}

/**
 * Utilitário para converter AudioBuffer em WAV PCM 16-bit
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
