/**
 * AudioFix - Módulo Inteligente de Renomeação e Limpeza de Faixas
 * 
 * Permite corrigir extensões de arquivos corrompidos (.txt, .unknown, .dat)
 * para o formato real (.mp3, .wav, etc.) sem perda de qualidade sonora,
 * além de remover sujeiras comuns de downloads (ex: "(Clipe Oficial)", "[Official Video]", "(Lyrics) HD",
 * espaços duplos e numerações indesejadas).
 */

import { AudioDetectionResult } from './audioDetector.ts';
import { TargetFormat } from './audioTranscoder.ts';

export interface RenameRules {
  targetFormat: TargetFormat;         // O formato padrão escolhido pelo usuário (ex: 'mp3', 'wav', 'flac', etc.)
  fixExtension: boolean;              // Padroniza a extensão para o formato escolhido (.mp3, etc.)
  removeVideoTags: boolean;           // Remove [Official Video], (Clipe Oficial), (Lyrics), HD, 4K, etc.
  removeLiveTags: boolean;            // Remove (Ao Vivo), [Ao Vivo], (Live), etc.
  removeTrackNumbers: boolean;        // Remove numerações prefixadas ("01 - ", "02. ", "track_01_")
  cleanSpacesAndUnderscores: boolean; // Substitui "_" por espaços e remove espaços duplos
  cleanBrackets: boolean;             // Remove parênteses ou colchetes vazios restantes
  caseMode: 'none' | 'titleCase' | 'lower' | 'upper';
  customFind: string;                 // Texto customizado para buscar
  customReplace: string;              // Texto customizado para substituir
  enumerateTracks: boolean;           // Prefixa faixa com "01 - ", "02 - "
}

export const DEFAULT_RENAME_RULES: RenameRules = {
  targetFormat: 'mp3',
  fixExtension: true,
  removeVideoTags: true,
  removeLiveTags: false,
  removeTrackNumbers: false,
  cleanSpacesAndUnderscores: true,
  cleanBrackets: true,
  caseMode: 'none',
  customFind: '',
  customReplace: '',
  enumerateTracks: false
};

export interface RenamePreviewItem {
  id: string;
  originalName: string;
  suggestedName: string;
  hasChanged: boolean;
  changes: string[];
  detectedExt: string;
  originalExt: string;
  formatName: string;
  isCustomEdited?: boolean;
}

/**
 * Remove tags comuns de títulos de músicas baixadas do YouTube/Web
 */
const VIDEO_AND_RIP_TAGS = [
  /\[\s*official\s+video\s*\]/gi,
  /\(\s*official\s+video\s*\)/gi,
  /\[\s*official\s+music\s+video\s*\]/gi,
  /\(\s*official\s+music\s+video\s*\)/gi,
  /\(\s*clipe\s+oficial\s*\)/gi,
  /\[\s*clipe\s+oficial\s*\]/gi,
  /\(\s*vídeo\s+oficial\s*\)/gi,
  /\[\s*vídeo\s+oficial\s*\]/gi,
  /\(\s*video\s+oficial\s*\)/gi,
  /\[\s*video\s+oficial\s*\]/gi,
  /\(\s*áudio\s+oficial\s*\)/gi,
  /\[\s*áudio\s+oficial\s*\]/gi,
  /\(\s*audio\s+oficial\s*\)/gi,
  /\[\s*audio\s+oficial\s*\]/gi,
  /\(\s*official\s+lyric\s+video\s*\)/gi,
  /\[\s*official\s+lyric\s+video\s*\]/gi,
  /\(\s*lyric\s+video\s*\)/gi,
  /\[\s*lyric\s+video\s*\]/gi,
  /\(\s*lyrics\s*\)/gi,
  /\[\s*lyrics\s*\]/gi,
  /\(\s*letra\s*\)/gi,
  /\[\s*letra\s*\]/gi,
  /\(\s*legendado\s*\)/gi,
  /\[\s*legendado\s*\]/gi,
  /\(\s*vers[aã]o\s+solo\s*\)/gi,
  /\[\s*vers[aã]o\s+solo\s*\]/gi,
  /\b(HD|4K|1080p|720p|HQ|Full\s*HD)\b/gi
];

const LIVE_TAGS = [
  /\(\s*ao\s+vivo\s*\)/gi,
  /\[\s*ao\s+vivo\s*\]/gi,
  /\(\s*live\s*\)/gi,
  /\[\s*live\s*\]/gi,
  /\(\s*live\s+performance\s*\)/gi,
  /\[\s*live\s+performance\s*\]/gi
];

/**
 * Converte string para Title Case inteligente em português/inglês
 */
function toSmartTitleCase(str: string): string {
  const minorWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet',
    'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'por', 'sem', 'ou', 'pra', 'pro', 'na', 'no', 'nas', 'nos',
    'ft.', 'feat.', 'vs.'
  ]);

  return str
    .split(' ')
    .map((word, index, arr) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      // Sempre capitaliza a primeira e a última palavra
      if (index > 0 && index < arr.length - 1 && minorWords.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Gera a prévia do novo nome de arquivo de acordo com as regras ativas
 */
export function generateCleanTrackName(
  originalName: string,
  detection: AudioDetectionResult,
  rules: RenameRules,
  trackIndex: number = 0
): { newName: string; hasChanged: boolean; changes: string[] } {
  const changes: string[] = [];

  // Separa o nome base da extensão original
  const lastDotIdx = originalName.lastIndexOf('.');
  let baseName = lastDotIdx > 0 ? originalName.substring(0, lastDotIdx) : originalName;
  const originalExt = lastDotIdx > 0 ? originalName.substring(lastDotIdx) : '';

  // 1. Determina a extensão final de acordo com o formato padrão escolhido pelo usuário
  let finalExt = originalExt;
  if (rules.fixExtension) {
    const desiredExt = `.${rules.targetFormat || 'mp3'}`;
    if (originalExt.toLowerCase() !== desiredExt.toLowerCase()) {
      finalExt = desiredExt;
      if (detection.formatCode === rules.targetFormat) {
        changes.push(`Extensão padronizada para ${desiredExt} (já é áudio compatível)`);
      } else {
        changes.push(`Extensão padronizada para ${desiredExt} (será convertido de ${detection.detectedFormat})`);
      }
    }
  }

  let cleanBase = baseName;

  // 2. Busca e substituição customizada
  if (rules.customFind && rules.customFind.trim().length > 0) {
    if (cleanBase.includes(rules.customFind)) {
      cleanBase = cleanBase.split(rules.customFind).join(rules.customReplace || '');
      changes.push(`Texto "${rules.customFind}" substituído`);
    }
  }

  // 3. Remover tags de vídeo/YouTube
  if (rules.removeVideoTags) {
    let videoTagFound = false;
    for (const tagRegex of VIDEO_AND_RIP_TAGS) {
      if (tagRegex.test(cleanBase)) {
        videoTagFound = true;
        cleanBase = cleanBase.replace(tagRegex, ' ');
      }
    }
    if (videoTagFound) {
      changes.push('Tags de vídeo/YouTube removidas (ex: Official Video, HD, Lyrics)');
    }
  }

  // 4. Remover tags de show ao vivo
  if (rules.removeLiveTags) {
    let liveTagFound = false;
    for (const liveRegex of LIVE_TAGS) {
      if (liveRegex.test(cleanBase)) {
        liveTagFound = true;
        cleanBase = cleanBase.replace(liveRegex, ' ');
      }
    }
    if (liveTagFound) {
      changes.push('Marcador "Ao Vivo" removido');
    }
  }

  // 5. Remover numeração prefixada
  if (rules.removeTrackNumbers) {
    const trackNumberRegex = /^(\s*(\d{1,3}|track[_-]?\d{1,3}|faixa[_-]?\d{1,3})\s*[-_.–—]\s*)/i;
    if (trackNumberRegex.test(cleanBase)) {
      cleanBase = cleanBase.replace(trackNumberRegex, '');
      changes.push('Numeração prefixada removida');
    }
  }

  // 6. Limpar underscores e múltiplos espaços
  if (rules.cleanSpacesAndUnderscores) {
    const hadUnderscores = cleanBase.includes('_');
    const hadDoubleSpaces = /\s{2,}/.test(cleanBase);

    cleanBase = cleanBase.replace(/_/g, ' ');
    cleanBase = cleanBase.replace(/\s{2,}/g, ' ');

    if (hadUnderscores || hadDoubleSpaces) {
      changes.push('Espaços e underscores padronizados');
    }
  }

  // 7. Limpar pontuações soltas ou hífens duplicados
  cleanBase = cleanBase
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();

  // 8. Limpar parênteses ou colchetes vazios que sobraram
  if (rules.cleanBrackets) {
    cleanBase = cleanBase
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .trim();
  }

  // 9. Modo de caixa (maiúsculas / minúsculas)
  if (rules.caseMode === 'titleCase') {
    cleanBase = toSmartTitleCase(cleanBase);
    changes.push('Formatado para Title Case');
  } else if (rules.caseMode === 'lower') {
    cleanBase = cleanBase.toLowerCase();
    changes.push('Convertido para minúsculas');
  } else if (rules.caseMode === 'upper') {
    cleanBase = cleanBase.toUpperCase();
    changes.push('Convertido para MAIÚSCULAS');
  }

  // 10. Enumeração ordenada opcional
  if (rules.enumerateTracks) {
    const num = String(trackIndex + 1).padStart(2, '0');
    cleanBase = `${num} - ${cleanBase}`;
    changes.push(`Prefixo numerado ${num} adicionado`);
  }

  // Garantir que a base não fique vazia
  if (!cleanBase || cleanBase.trim().length === 0) {
    cleanBase = `faixa_${trackIndex + 1}`;
  }

  const finalName = `${cleanBase}${finalExt}`;
  const hasChanged = finalName !== originalName;

  return {
    newName: finalName,
    hasChanged,
    changes
  };
}
