/**
 * AudioFix - Detector de Formato Real por Magic Numbers (Bytes de Cabeçalho)
 * 
 * Permite identificar o codec/container real de arquivos de áudio cujos nomes
 * ou extensões foram corrompidos no pendrive (ex: "musica.txt", "faixa.unknown", "som.dat").
 */

export type AudioFormatCode = 'mp3' | 'wav' | 'flac' | 'ogg' | 'm4a' | 'aiff' | 'wma' | 'webm' | 'unknown' | 'non_audio';

export interface AudioDetectionResult {
  detectedFormat: string;
  formatCode: AudioFormatCode;
  category: 'audio' | 'non-audio' | 'unknown';
  mimeType: string;
  suggestedExt: string;
  details: string;
  confidence: 'alta' | 'média' | 'baixa';
  isAudio: boolean;
}

/**
 * Lê os primeiros bytes de um arquivo para detectar a assinatura de áudio
 */
export async function detectAudioFormat(file: File): Promise<AudioDetectionResult> {
  try {
    // Ler os primeiros 8192 bytes (suficiente para detectar ID3, headers RIFF, OGG, ftyp e frames MPEG)
    const headerBuffer = await file.slice(0, 8192).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);

    if (bytes.length === 0) {
      return {
        detectedFormat: 'Vazio (0 bytes)',
        formatCode: 'non_audio',
        category: 'non-audio',
        mimeType: 'application/octet-stream',
        suggestedExt: '.bin',
        details: 'O arquivo não possui conteúdo',
        confidence: 'alta',
        isAudio: false
      };
    }

    // 1. Checagem de ID3v2 (MP3 com metadados no início)
    // Assinatura: "ID3" (0x49 0x44 0x33)
    if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = `v2.${bytes[3]}`;
      return {
        detectedFormat: `MP3 (ID3${version})`,
        formatCode: 'mp3',
        category: 'audio',
        mimeType: 'audio/mpeg',
        suggestedExt: '.mp3',
        details: `Container ID3${version} com áudio MPEG Layer 3`,
        confidence: 'alta',
        isAudio: true
      };
    }

    // 2. Checagem de RIFF / WAVE (WAV)
    // Bytes 0-3 = "RIFF", Bytes 8-11 = "WAVE"
    if (bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      
      let formatDetails = 'Áudio WAVE PCM';
      if (bytes.length >= 22) {
        const audioFormat = bytes[20] | (bytes[21] << 8);
        if (audioFormat === 1) formatDetails = 'WAV PCM Não-comprimido';
        else if (audioFormat === 3) formatDetails = 'WAV IEEE Float 32-bit';
        else if (audioFormat === 6) formatDetails = 'WAV A-law';
        else if (audioFormat === 7) formatDetails = 'WAV µ-law';
      }
      return {
        detectedFormat: 'WAV',
        formatCode: 'wav',
        category: 'audio',
        mimeType: 'audio/wav',
        suggestedExt: '.wav',
        details: formatDetails,
        confidence: 'alta',
        isAudio: true
      };
    }

    // 3. Checagem de FLAC (Free Lossless Audio Codec)
    // Bytes 0-3 = "fLaC" (0x66 0x4C 0x61 0x43)
    if (bytes.length >= 4 &&
        bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
      return {
        detectedFormat: 'FLAC',
        formatCode: 'flac',
        category: 'audio',
        mimeType: 'audio/flac',
        suggestedExt: '.flac',
        details: 'Áudio sem perdas FLAC (Lossless)',
        confidence: 'alta',
        isAudio: true
      };
    }

    // 4. Checagem de Ogg Container (Vorbis, Opus, FLAC)
    // Bytes 0-3 = "OggS" (0x4F 0x67 0x67 0x53)
    if (bytes.length >= 4 &&
        bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      let subtype = 'Ogg Vorbis';
      const textHeader = new TextDecoder('ascii').decode(bytes.slice(0, 64));
      if (textHeader.includes('OpusHead')) {
        subtype = 'Ogg Opus';
      } else if (textHeader.includes('vorbis')) {
        subtype = 'Ogg Vorbis';
      }
      return {
        detectedFormat: subtype,
        formatCode: 'ogg',
        category: 'audio',
        mimeType: 'audio/ogg',
        suggestedExt: '.ogg',
        details: `Container Ogg contendo codec ${subtype}`,
        confidence: 'alta',
        isAudio: true
      };
    }

    // 5. Checagem de M4A / AAC / MP4 (ISO Base Media File Format)
    // Bytes 4-7 = "ftyp"
    if (bytes.length >= 12 &&
        bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      let isM4a = brand.startsWith('M4A') || brand.startsWith('mp4') || brand.startsWith('isom');
      return {
        detectedFormat: brand.startsWith('M4A') ? 'M4A (AAC/ALAC)' : 'MP4/M4A Áudio',
        formatCode: 'm4a',
        category: 'audio',
        mimeType: 'audio/mp4',
        suggestedExt: '.m4a',
        details: `Container MP4/M4A com marca [${brand.trim()}]`,
        confidence: isM4a ? 'alta' : 'média',
        isAudio: true
      };
    }

    // 6. Checagem de AAC ADTS (Audio Data Transport Stream)
    // Syncword: 12 bits de 1s (0xFF 0xF0 a 0xFF 0xFF)
    if (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xF6) === 0xF0) {
      return {
        detectedFormat: 'AAC (ADTS)',
        formatCode: 'm4a',
        category: 'audio',
        mimeType: 'audio/aac',
        suggestedExt: '.aac',
        details: 'Fluxo bruto AAC ADTS',
        confidence: 'alta',
        isAudio: true
      };
    }

    // 7. Checagem de AIFF (Audio Interchange File Format)
    // Bytes 0-3 = "FORM", Bytes 8-11 = "AIFF" ou "AIFC"
    if (bytes.length >= 12 &&
        bytes[0] === 0x46 && bytes[1] === 0x4F && bytes[2] === 0x52 && bytes[3] === 0x4D &&
        bytes[8] === 0x41 && bytes[9] === 0x49 && bytes[10] === 0x46 &&
        (bytes[11] === 0x46 || bytes[11] === 0x43)) {
      return {
        detectedFormat: 'AIFF',
        formatCode: 'aiff',
        category: 'audio',
        mimeType: 'audio/aiff',
        suggestedExt: '.aiff',
        details: 'Áudio Apple/Amiga AIFF Não-comprimido',
        confidence: 'alta',
        isAudio: true
      };
    }

    // 8. Checagem de WMA / ASF (Windows Media Audio)
    if (bytes.length >= 16 &&
        bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xB2 && bytes[3] === 0x75 &&
        bytes[4] === 0x8E && bytes[5] === 0x66 && bytes[6] === 0xCF && bytes[7] === 0x11) {
      return {
        detectedFormat: 'WMA',
        formatCode: 'wma',
        category: 'audio',
        mimeType: 'audio/x-ms-wma',
        suggestedExt: '.wma',
        details: 'Windows Media Audio (ASF)',
        confidence: 'alta',
        isAudio: true
      };
    }

    // 9. Checagem de WebM / Matroska Áudio
    if (bytes.length >= 4 &&
        bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      return {
        detectedFormat: 'WebM / Opus',
        formatCode: 'webm',
        category: 'audio',
        mimeType: 'audio/webm',
        suggestedExt: '.webm',
        details: 'Container Matroska/WebM (Opus ou Vorbis)',
        confidence: 'alta',
        isAudio: true
      };
    }

    // 10. Busca por MPEG Frame Sync (MP3 sem tag ID3 inicial)
    for (let i = 0; i < Math.min(bytes.length - 4, 4096); i++) {
      if (bytes[i] === 0xFF && (bytes[i + 1] & 0xE0) === 0xE0) {
        const version = (bytes[i + 1] >> 3) & 0x03;
        const layer = (bytes[i + 1] >> 1) & 0x03;
        const bitrateIdx = (bytes[i + 2] >> 4) & 0x0F;
        const samplerateIdx = (bytes[i + 2] >> 2) & 0x03;

        if (layer === 1 && bitrateIdx !== 0x0F && samplerateIdx !== 0x03) {
          const verStr = version === 3 ? 'MPEG-1' : version === 2 ? 'MPEG-2' : 'MPEG-2.5';
          return {
            detectedFormat: `MP3 Puro (${verStr})`,
            formatCode: 'mp3',
            category: 'audio',
            mimeType: 'audio/mpeg',
            suggestedExt: '.mp3',
            details: `Frame MPEG Layer 3 encontrado no offset ${i}`,
            confidence: 'média',
            isAudio: true
          };
        }
      }
    }

    // 11. Checagem de Não-Áudio Conhecido (imagens, zips, pdfs, scripts)
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return {
        detectedFormat: 'Imagem PNG',
        formatCode: 'non_audio',
        category: 'non-audio',
        mimeType: 'image/png',
        suggestedExt: '.png',
        details: 'Aviso: Este arquivo é uma imagem PNG, não áudio',
        confidence: 'alta',
        isAudio: false
      };
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return {
        detectedFormat: 'Imagem JPEG',
        formatCode: 'non_audio',
        category: 'non-audio',
        mimeType: 'image/jpeg',
        suggestedExt: '.jpg',
        details: 'Aviso: Este arquivo é uma foto/imagem JPEG',
        confidence: 'alta',
        isAudio: false
      };
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
      return {
        detectedFormat: 'Arquivo Compactado ZIP',
        formatCode: 'non_audio',
        category: 'non-audio',
        mimeType: 'application/zip',
        suggestedExt: '.zip',
        details: 'Aviso: Este arquivo é um arquivo compactado ZIP',
        confidence: 'alta',
        isAudio: false
      };
    }
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return {
        detectedFormat: 'Documento PDF',
        formatCode: 'non_audio',
        category: 'non-audio',
        mimeType: 'application/pdf',
        suggestedExt: '.pdf',
        details: 'Aviso: Este arquivo é um documento PDF',
        confidence: 'alta',
        isAudio: false
      };
    }

    // Não-identificado
    return {
      detectedFormat: 'Formato Não-Identificado',
      formatCode: 'unknown',
      category: 'unknown',
      mimeType: 'application/octet-stream',
      suggestedExt: '.mp3',
      details: 'Assinatura desconhecida. O motor tentará decodificar',
      confidence: 'baixa',
      isAudio: true
    };

  } catch (err) {
    return {
      detectedFormat: 'Erro na Análise',
      formatCode: 'unknown',
      category: 'unknown',
      mimeType: 'application/octet-stream',
      suggestedExt: '.mp3',
      details: `Falha ao ler cabeçalho: ${err instanceof Error ? err.message : String(err)}`,
      confidence: 'baixa',
      isAudio: true
    };
  }
}
