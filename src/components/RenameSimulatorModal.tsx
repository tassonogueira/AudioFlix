/**
 * AudioFix - Modal / Painel Interativo de Teste e Simulação de Renomeação
 * 
 * Permite ao usuário simular, testar e pré-visualizar em tempo real como
 * as faixas serão renomeadas e como as extensões serão padronizadas com base
 * no formato padrão escolhido (ex: MP3), sem deixar arquivos esquecidos em M4A.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Check,
  Download,
  Copy,
  Sliders,
  RotateCcw,
  CheckCircle2,
  FileAudio,
  ArrowRight,
  Archive,
  RefreshCw,
  Zap
} from 'lucide-react';
import JSZip from 'jszip';
import { QueueItem } from '../App.tsx';
import { TargetFormat } from '../utils/audioTranscoder.ts';
import {
  RenameRules,
  DEFAULT_RENAME_RULES,
  generateCleanTrackName
} from '../utils/trackRenamer.ts';

interface RenameSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueueItem[];
  targetFormat: TargetFormat;
  onTargetFormatChange?: (format: TargetFormat) => void;
  onApplyNamesToQueue: (customNamesMap: Record<string, string>) => void;
}

export default function RenameSimulatorModal({
  isOpen,
  onClose,
  queue,
  targetFormat,
  onTargetFormatChange,
  onApplyNamesToQueue
}: RenameSimulatorModalProps) {
  const [rules, setRules] = useState<RenameRules>({
    ...DEFAULT_RENAME_RULES,
    targetFormat
  });
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [filterView, setFilterView] = useState<'all' | 'needs_conversion' | 'already_target'>('all');
  const [copiedList, setCopiedList] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  // Mantém a regra sincronizada se o targetFormat mudar externamente
  React.useEffect(() => {
    setRules(prev => ({ ...prev, targetFormat }));
  }, [targetFormat]);

  // Calcula a simulação em tempo real para cada item da fila
  const simulatedItems = useMemo(() => {
    return queue.map((item, index) => {
      const generated = generateCleanTrackName(item.file.name, item.detection, rules, index);
      const customName = customOverrides[item.id];
      const finalName = customName !== undefined ? customName : generated.newName;
      const isOverridden = customName !== undefined && customName !== generated.newName;
      const isAlreadyTarget = item.detection.formatCode === rules.targetFormat;

      return {
        id: item.id,
        file: item.file,
        detection: item.detection,
        originalName: item.file.name,
        suggestedName: finalName,
        hasChanged: finalName !== item.file.name,
        isAlreadyTarget,
        actionType: isAlreadyTarget ? 'stream_copy' : 'transcode',
        changes: isOverridden ? [...generated.changes, 'Editado manualmente'] : generated.changes,
        isOverridden
      };
    });
  }, [queue, rules, customOverrides]);

  // Estatísticas da simulação
  const stats = useMemo(() => {
    const total = simulatedItems.length;
    const needsConversion = simulatedItems.filter(i => !i.isAlreadyTarget).length;
    const alreadyTarget = simulatedItems.filter(i => i.isAlreadyTarget).length;
    const extensionFixes = simulatedItems.filter(i => 
      !i.originalName.toLowerCase().endsWith(`.${rules.targetFormat}`)
    ).length;
    return { total, needsConversion, alreadyTarget, extensionFixes };
  }, [simulatedItems, rules.targetFormat]);

  // Itens filtrados para a visualização na tabela
  const displayedItems = useMemo(() => {
    if (filterView === 'needs_conversion') return simulatedItems.filter(i => !i.isAlreadyTarget);
    if (filterView === 'already_target') return simulatedItems.filter(i => i.isAlreadyTarget);
    return simulatedItems;
  }, [simulatedItems, filterView]);

  if (!isOpen) return null;

  // Atualizar regras
  const updateRule = <K extends keyof RenameRules>(key: K, value: RenameRules[K]) => {
    setRules(prev => ({ ...prev, [key]: value }));
    if (key === 'targetFormat' && onTargetFormatChange) {
      onTargetFormatChange(value as TargetFormat);
    }
  };

  // Restaurar regras padrão
  const handleResetRules = () => {
    setRules({
      ...DEFAULT_RENAME_RULES,
      targetFormat
    });
    setCustomOverrides({});
  };

  // Alteração manual inline de um nome específico
  const handleNameChange = (id: string, newName: string) => {
    setCustomOverrides(prev => ({ ...prev, [id]: newName }));
  };

  // Download individual do arquivo original com o novo nome
  const handleDownloadSingle = (item: typeof simulatedItems[0]) => {
    const url = URL.createObjectURL(item.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Download em ZIP dos arquivos renomeados
  const handleDownloadAllRenamedZip = async () => {
    if (simulatedItems.length === 0) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();

      simulatedItems.forEach(item => {
        zip.file(item.suggestedName, item.file);
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faixas_padronizadas_${rules.targetFormat}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Erro ao gerar ZIP:', err);
      alert('Erro ao compactar arquivos.');
    } finally {
      setIsZipping(false);
    }
  };

  // Copiar lista de nomes (Antes ➔ Depois)
  const handleCopyList = () => {
    const textLines = simulatedItems.map(item => 
      `Antes: ${item.originalName} [${item.detection.detectedFormat}]\nDepois: ${item.suggestedName} [${item.isAlreadyTarget ? 'Preservado' : 'Requer conversão para ' + rules.targetFormat.toUpperCase()}]\n---`
    ).join('\n');

    navigator.clipboard.writeText(textLines).then(() => {
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2500);
    });
  };

  // Aplicar à fila principal
  const handleApplyToQueue = () => {
    const map: Record<string, string> = {};
    simulatedItems.forEach(item => {
      map[item.id] = item.suggestedName;
    });
    onApplyNamesToQueue(map);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabeçalho do Simulador */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Simulador: Como Era ➔ Como Vai Ficar
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Formato Padrão: {rules.targetFormat.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Visualize com precisão o nome e a extensão de cada música antes de processar.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
            title="Fechar simulador"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Seleção do Formato Padrão + Estatísticas */}
        <div className="px-4 py-3 bg-zinc-950/40 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-3 text-xs">
          
          {/* Seletor do Formato Padrão dentro do modal */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-300 font-semibold uppercase text-[11px]">Formato Padrão:</span>
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              {(['mp3', 'wav', 'flac', 'm4a', 'ogg'] as TargetFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => updateRule('targetFormat', fmt)}
                  className={`px-2.5 py-1 text-xs font-mono uppercase font-bold rounded-md transition ${
                    rules.targetFormat === fmt
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400">
              Total: <strong className="text-white">{stats.total}</strong>
            </span>
            <span className="h-3 w-px bg-zinc-700"></span>
            <span className="text-emerald-400">
              ⚡ <strong className="text-emerald-300">{stats.alreadyTarget}</strong> já são {rules.targetFormat.toUpperCase()} (Preservados)
            </span>
            <span className="h-3 w-px bg-zinc-700"></span>
            <span className="text-amber-400">
              🔄 <strong className="text-amber-300">{stats.needsConversion}</strong> serão convertidos para {rules.targetFormat.toUpperCase()}
            </span>
          </div>

          <button
            onClick={handleResetRules}
            className="flex items-center gap-1 px-2.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            title="Restaurar configurações padrão"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão
          </button>
        </div>

        {/* Conteúdo Rolável: Regras e Tabela Antes ➔ Depois */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          
          {/* Caixa de Regras de Limpeza Inteligente */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Regras de Limpeza Automática
              </span>
              <span className="text-[11px] text-zinc-500">
                Extensões serão sempre padronizadas para .{rules.targetFormat}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.fixExtension}
                  onChange={(e) => updateRule('fixExtension', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Padronizar Extensão para .{rules.targetFormat}</div>
                  <div className="text-[11px] text-zinc-400">Corrige .txt, .unknown e formatos divergentes (ex: M4A ➔ MP3)</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.removeVideoTags}
                  onChange={(e) => updateRule('removeVideoTags', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Remover Tags do YouTube</div>
                  <div className="text-[11px] text-zinc-400">Remove [Official Video], (Clipe Oficial), (Lyrics) HD</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.cleanSpacesAndUnderscores}
                  onChange={(e) => updateRule('cleanSpacesAndUnderscores', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Limpar Espaços & Underscores</div>
                  <div className="text-[11px] text-zinc-400">Transforma "Bruno__Marrone" em "Bruno Marrone"</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.removeTrackNumbers}
                  onChange={(e) => updateRule('removeTrackNumbers', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Remover Numeração Inicial</div>
                  <div className="text-[11px] text-zinc-400">Remove prefixos como "01 - ", "02. ", "track_01_"</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.removeLiveTags}
                  onChange={(e) => updateRule('removeLiveTags', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Remover "(Ao Vivo)" / "[Live]"</div>
                  <div className="text-[11px] text-zinc-400">Remove identificadores de shows gravados</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={rules.enumerateTracks}
                  onChange={(e) => updateRule('enumerateTracks', e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500/20 bg-zinc-950 border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-zinc-200">Enumerar Faixas (01, 02...)</div>
                  <div className="text-[11px] text-zinc-400">Adiciona numeração sequencial organizada</div>
                </div>
              </label>
            </div>
          </div>

          {/* Tabela Comparativa: Como Era ➔ Como Ficou */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Comparativo Detalhado ({displayedItems.length})
              </span>

              {/* Filtros da Tabela */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                <button
                  onClick={() => setFilterView('all')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    filterView === 'all'
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Todas ({simulatedItems.length})
                </button>
                <button
                  onClick={() => setFilterView('needs_conversion')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    filterView === 'needs_conversion'
                      ? 'bg-amber-500/20 text-amber-300 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Serão Convertidas ({stats.needsConversion})
                </button>
                <button
                  onClick={() => setFilterView('already_target')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    filterView === 'already_target'
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Já em {rules.targetFormat.toUpperCase()} ({stats.alreadyTarget})
                </button>
              </div>
            </div>

            {/* Lista dos Arquivos com Comparação Lado a Lado */}
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/60 divide-y divide-zinc-800/80">
              {displayedItems.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  Nenhum arquivo nesta categoria.
                </div>
              ) : (
                displayedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    {/* COMO ERA (Original) */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          Como Era
                        </span>
                        <span className="text-xs text-zinc-400 truncate font-mono" title={item.originalName}>
                          {item.originalName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className={`flex items-center gap-1 font-medium ${
                          item.detection.formatCode === 'm4a' ? 'text-amber-400' : 'text-sky-400'
                        }`}>
                          <FileAudio className="w-3 h-3" />
                          Formato Original: {item.detection.detectedFormat}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-400">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>

                    {/* Seta Central Indicativa */}
                    <div className="hidden md:flex items-center justify-center text-zinc-600 px-2 shrink-0">
                      <ArrowRight className="w-4 h-4 text-emerald-400" />
                    </div>

                    {/* COMO FICOU (Novo Nome e Formato) */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                          item.isAlreadyTarget
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {item.isAlreadyTarget ? `Já é ${rules.targetFormat.toUpperCase()}` : `Converter ➔ ${rules.targetFormat.toUpperCase()}`}
                        </span>

                        <input
                          type="text"
                          value={item.suggestedName}
                          onChange={(e) => handleNameChange(item.id, e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded px-2.5 py-1 text-xs text-emerald-300 font-mono focus:outline-none"
                          title="Clique para editar manualmente se desejar"
                        />
                      </div>

                      {/* Chips de Ação */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.isAlreadyTarget ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 flex items-center gap-1 font-medium">
                            <Zap className="w-2.5 h-2.5" />
                            Preservado direto (Stream Copy sem perda)
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 flex items-center gap-1 font-medium">
                            <RefreshCw className="w-2.5 h-2.5" />
                            Será convertido de {item.detection.detectedFormat} para {rules.targetFormat.toUpperCase()}
                          </span>
                        )}

                        {item.changes.map((ch, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Ação Individual */}
                    <div className="shrink-0 flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => handleDownloadSingle(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                        title="Baixar cópia individual com este nome"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">Baixar</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações do Simulador */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Todos os arquivos ficarão garantidos em <strong>.{rules.targetFormat}</strong> sem exceções.
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
            <button
              onClick={handleCopyList}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              title="Copiar lista de antes e depois"
            >
              {copiedList ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedList ? 'Copiado!' : 'Copiar Lista (Antes/Depois)'}
            </button>

            <button
              onClick={handleApplyToQueue}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-colors"
              title="Aplica os novos nomes definidos e fecha o simulador"
            >
              <Check className="w-3.5 h-3.5" />
              Aplicar Nomes na Fila
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
