/**
 * AudioFix - Gerador de Amostras de Teste para Simulação
 * 
 * Cria arquivos sintetizados simulando:
 * 1. Arquivo que JÁ É MP3, mas com extensão .txt (requer apenas reparo de extensão sem re-encode)
 * 2. Arquivo que É WAV com extensão .unknown (requer transcodificação)
 * 3. Arquivo que É WAV com extensão .dat (requer transcodificação)
 * 4. Arquivo que JÁ É MP3 e com extensão correta .mp3 (já está perfeito/compatível)
 */

function createSyntheticWav(frequency: number, durationSec: number = 2.5, sampleRate: number = 44100): Blob {
  const numSamples = Math.floor(sampleRate * durationSec);
  const numChannels = 2; // Stereo
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // 1. Cabeçalho RIFF
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // 2. Sub-chunk "fmt "
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  // 3. Sub-chunk "data"
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 4. Escrever áudio harmônico
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.05);
    const release = Math.max(0, 1 - (t - (durationSec - 0.2)) / 0.2);
    const envelope = attack * release;

    const waveL = Math.sin(2 * Math.PI * frequency * t) * 0.6 +
                  Math.sin(2 * Math.PI * (frequency * 1.25) * t) * 0.25;
    const waveR = Math.sin(2 * Math.PI * (frequency * 1.002) * t) * 0.6 +
                  Math.sin(2 * Math.PI * (frequency * 1.252) * t) * 0.25;

    view.setInt16(offset, Math.max(-1, Math.min(1, waveL * envelope)) * 0x7FFF, true);
    view.setInt16(offset + 2, Math.max(-1, Math.min(1, waveR * envelope)) * 0x7FFF, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Cria um arquivo sintético com cabeçalho ID3v2 (MP3 genuíno)
 */
function createSyntheticMp3(frequency: number, durationSec: number = 2.0): Blob {
  // Cria container com tag ID3v2 válida no início + payload de áudio
  const wavBlob = createSyntheticWav(frequency, durationSec);
  // Header ID3v2: "ID3" + version 3 + flags 0 + size (10 bytes)
  const id3Header = new Uint8Array([
    0x49, 0x44, 0x33, // "ID3"
    0x03, 0x00,       // v2.3.0
    0x00,             // flags
    0x00, 0x00, 0x00, 0x20 // syncsafe size (32 bytes de tags)
  ]);
  
  // Tag simples de título
  const titleTag = new TextEncoder().encode('TIT2\0\0\0\x0ESintetizador AudioFix');

  return new Blob([id3Header, titleTag, wavBlob], { type: 'audio/mpeg' });
}

/**
 * Cria um arquivo sintético simulando container M4A / AAC
 */
function createSyntheticM4a(frequency: number, durationSec: number = 2.0): Blob {
  const wavBlob = createSyntheticWav(frequency, durationSec);
  // Header MP4/M4A com box 'ftyp' e brand 'M4A '
  const ftypBox = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // Box size: 32 bytes
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x4D, 0x34, 0x41, 0x20, // Major brand: 'M4A '
    0x00, 0x00, 0x02, 0x00, // Minor version
    0x4D, 0x34, 0x41, 0x20, // Compatible brand 'M4A '
    0x6D, 0x70, 0x34, 0x32, // Compatible brand 'mp42'
    0x69, 0x73, 0x6F, 0x6D, // Compatible brand 'isom'
    0x00, 0x00, 0x00, 0x00
  ]);

  return new Blob([ftypBox, wavBlob], { type: 'audio/mp4' });
}

export function generateTestSampleFiles(): File[] {
  // Amostra 1: Arquivo que é M4A / AAC (muito comum em downloads do YouTube)
  // O app DEVE converter para MP3 quando o usuário escolher MP3 como formato padrão!
  const blob1 = createSyntheticM4a(440, 2.5);
  const file1 = new File([blob1], '01 - Calvin Harris ft. Rihanna - This Is What You Came For (Lyrics) HD.m4a', {
    type: 'audio/mp4',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 30
  });

  // Amostra 2: Arquivo MP3 disfarçado de .unknown com tag de clipe
  const blob2 = createSyntheticMp3(523.25, 2.0);
  const file2 = new File([blob2], 'Clean Bandit - Rockabye ft. Sean Paul  Anne-Marie [Official Video].unknown', {
    type: 'application/octet-stream',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 60
  });

  // Amostra 3: Arquivo MP3 com espaços duplos e tag ao vivo
  const blob3 = createSyntheticMp3(392.00, 2.8);
  const file3 = new File([blob3], 'Bruno  Marrone, Jorge  Mateus - Surto De Amor (Ao Vivo).mp3', {
    type: 'audio/mpeg',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 10
  });

  // Amostra 4: Arquivo MP3 disfarçado de .txt
  const blob4 = createSyntheticMp3(349.23, 2.2);
  const file4 = new File([blob4], 'Ana Castela - Pipoco (Versão Solo).txt', {
    type: 'text/plain',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 15
  });

  // Amostra 5: Arquivo WAV com extensão .dat
  const blob5 = createSyntheticWav(659.25, 2.0);
  const file5 = new File([blob5], 'gravacao_acustica_faixa05.dat', {
    type: 'application/octet-stream',
    lastModified: Date.now() - 1000 * 60 * 60 * 24 * 90
  });

  return [file1, file2, file3, file4, file5];
}
