import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
  Sparkles,
  Search,
  Loader2,
  Music,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { PlayerTrack } from './AudioFlixPlayer.tsx';

interface VoiceCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayTrack: (track: PlayerTrack, list?: PlayerTrack[]) => void;
  onSearchQuery?: (query: string) => void;
  onTogglePlay?: () => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  isPlaying?: boolean;
  currentTrack?: PlayerTrack | null;
}

export default function VoiceCommandModal({
  isOpen,
  onClose,
  onPlayTrack,
  onSearchQuery,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  isPlaying,
  currentTrack
}: VoiceCommandModalProps) {
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [transcript, setTranscript] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Clique no microfone para falar');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [foundTrack, setFoundTrack] = useState<PlayerTrack | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const autoCloseTimerRef = useRef<any>(null);

  // Verifica o status de permissão do microfone ao abrir
  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      setIsListening(false);
      setTranscript('');
      setFoundTrack(null);
      setErrorMessage(null);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setStatusMessage('Reconhecimento de voz não suportado neste navegador.');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any })
        .then((perm) => {
          if (perm.state === 'granted') {
            setPermissionStatus('granted');
            startRecognition();
          } else if (perm.state === 'denied') {
            setPermissionStatus('denied');
          } else {
            setPermissionStatus('prompt');
          }
        })
        .catch(() => {
          setPermissionStatus('prompt');
        });
    } else {
      setPermissionStatus('prompt');
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [isOpen]);

  // Inicia o motor de reconhecimento de fala
  const startRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
        setStatusMessage('Ouvindo... Peça qualquer música ou artista');
      };

      recognition.onresult = (event: any) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);

        const isFinal = event.results[event.results.length - 1].isFinal;
        if (isFinal && currentText.trim()) {
          setIsListening(false);
          handleProcessVoiceCommand(currentText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Erro de reconhecimento de voz:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setPermissionStatus('denied');
          setErrorMessage('Permissão de microfone negada. Autorize o acesso para continuar.');
          setStatusMessage('Microfone bloqueado.');
        } else if (event.error === 'no-speech') {
          setStatusMessage('Nenhuma voz detectada. Clique no microfone e tente falar novamente.');
        } else {
          setStatusMessage('Não foi possível reconhecer o áudio. Tente novamente.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Falha ao iniciar SpeechRecognition:', err);
    }
  };

  // Solicita explicitamente a permissão do microfone ao usuário via navegador
  const requestMicPermission = async () => {
    setErrorMessage(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermissionStatus('granted');
        startRecognition();
      } else {
        setPermissionStatus('granted');
        startRecognition();
      }
    } catch (err: any) {
      console.warn('Permissão de microfone rejeitada:', err);
      setPermissionStatus('denied');
      setErrorMessage('Permissão negada. Clique no ícone de configurações ao lado do endereço do site para permitir o microfone.');
    }
  };

  // Processa o comando de voz falado
  const handleProcessVoiceCommand = async (rawText: string) => {
    const text = rawText.trim().toLowerCase();

    // 1. COMANDOS DE CONTROLE DE REPRODUÇÃO
    if (text.includes('pausar') || text.includes('pause') || text.includes('parar')) {
      if (isPlaying) onTogglePlay?.();
      setStatusMessage('⏸️ Música pausada');
      autoCloseTimerRef.current = setTimeout(onClose, 1400);
      return;
    }

    if (text === 'tocar' || text === 'play' || text === 'continuar' || text === 'despausar') {
      if (!isPlaying) onTogglePlay?.();
      setStatusMessage('▶️ Reprodução iniciada');
      autoCloseTimerRef.current = setTimeout(onClose, 1400);
      return;
    }

    if (text.includes('próxima') || text.includes('proxima') || text.includes('pular') || text.includes('avançar')) {
      onNextTrack?.();
      setStatusMessage('⏭️ Pulando para a próxima faixa');
      autoCloseTimerRef.current = setTimeout(onClose, 1400);
      return;
    }

    if (text.includes('anterior') || text.includes('voltar')) {
      onPrevTrack?.();
      setStatusMessage('⏮️ Voltando para a faixa anterior');
      autoCloseTimerRef.current = setTimeout(onClose, 1400);
      return;
    }

    // 2. COMANDO DE PEDIDO DE MÚSICA
    let songQuery = rawText.trim();
    songQuery = songQuery.replace(/^(tocar|toca|coloque|coloca|ouvir|ouça|quero ouvir|pesquise|pesquisar|busca|buscar)\s+/i, '');
    songQuery = songQuery.replace(/\s+(por favor|pra mim)$/i, '');
    songQuery = songQuery.trim();

    if (!songQuery) {
      setStatusMessage('Não entendi qual música deseja. Fale novamente.');
      return;
    }

    setStatusMessage(`🔍 Buscando e conectando "${songQuery}"...`);
    setIsSearching(true);
    setErrorMessage(null);

    try {
      const searchUrl = `/api/music/search-all?q=${encodeURIComponent(songQuery)}`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error('Falha na busca');
      const data = await res.json();

      const candidates: any[] = [];
      if (Array.isArray(data.songs) && data.songs.length > 0) candidates.push(...data.songs);
      if (Array.isArray(data.youtube) && data.youtube.length > 0) candidates.push(...data.youtube);

      if (candidates.length === 0) {
        const ytRes = await fetch(`/api/youtube/search?q=${encodeURIComponent(songQuery)}`);
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          if (Array.isArray(ytData.results) && ytData.results.length > 0) {
            candidates.push(...ytData.results);
          }
        }
      }

      if (candidates.length > 0) {
        const topMatch = candidates[0];
        const formattedTrack: PlayerTrack = {
          id: topMatch.id || topMatch.youtubeId || `voice_${Date.now()}`,
          title: topMatch.title || songQuery,
          artist: topMatch.artist || topMatch.author || 'Artista',
          album: topMatch.album,
          artwork: topMatch.artwork || topMatch.thumbnail || topMatch.image,
          durationSeconds: topMatch.durationSeconds || topMatch.duration || topMatch.seconds,
          youtubeId: topMatch.youtubeId || (typeof topMatch.id === 'string' && topMatch.id.length === 11 ? topMatch.id : undefined)
        };

        setFoundTrack(formattedTrack);
        setStatusMessage(`▶️ Conectando "${formattedTrack.title}"!`);

        // Dispara a reprodução imediata com áudio completo
        onPlayTrack(formattedTrack);
        if (onSearchQuery) {
          onSearchQuery(songQuery);
        }

        autoCloseTimerRef.current = setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setStatusMessage(`Nenhuma música encontrada para "${songQuery}". Tente outro termo.`);
      }
    } catch (err: any) {
      console.warn('Erro ao processar comando de voz:', err);
      setErrorMessage(`Não foi possível carregar "${songQuery}". Tente novamente.`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleToggleListening = () => {
    if (!isSupported) return;

    if (permissionStatus !== 'granted') {
      requestMicPermission();
      return;
    }

    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
      setStatusMessage('Microfone pausado.');
    } else {
      setTranscript('');
      setFoundTrack(null);
      setErrorMessage(null);
      startRecognition();
    }
  };

  const handleChipClick = (phrase: string) => {
    setTranscript(phrase);
    handleProcessVoiceCommand(phrase);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualQuery.trim()) {
      handleProcessVoiceCommand(manualQuery.trim());
      setManualQuery('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden">
        {/* Luz ambiente animada */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
          isListening ? 'bg-emerald-500/20 scale-125' : 'bg-teal-500/10 scale-100'
        }`} />

        {/* Botão de Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ========================================================= */}
        {/* CAIXA DE PERMISSÃO DE MICROFONE (SE AINDA NÃO AUTORIZADO) */}
        {/* ========================================================= */}
        {permissionStatus !== 'granted' ? (
          <div className="w-full flex flex-col items-center py-2 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
              <Mic className="w-8 h-8 animate-pulse" />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Autorização Necessária</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
              Permitir Acesso ao Microfone
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mb-6">
              Para você poder pedir qualquer música ou artista apenas falando, o AudioFlix precisa de autorização para ouvir pelo microfone deste aparelho.
            </p>

            <button
              type="button"
              onClick={requestMicPermission}
              className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-xl shadow-emerald-950/50 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Mic className="w-5 h-5" />
              <span>Autorizar Microfone Agora</span>
            </button>

            {permissionStatus === 'denied' && (
              <div className="w-full mt-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Microfone bloqueado pelo navegador</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  1. Clique no ícone de <strong>cadeado ou configurações</strong> ao lado do link do site.
                </p>
                <p className="text-[11px] text-slate-300">
                  2. Altere o Microfone para <strong>Permitir</strong> e clique no botão abaixo.
                </p>
                <button
                  type="button"
                  onClick={requestMicPermission}
                  className="mt-2 w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Tentar Novamente</span>
                </button>
              </div>
            )}

            {/* Alternativa: Digitação manual */}
            <form onSubmit={handleManualSubmit} className="w-full mt-6 pt-4 border-t border-slate-800/80 flex gap-2">
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Ou digite o nome da música aqui..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-slate-700"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Buscar</span>
              </button>
            </form>
          </div>
        ) : (
          /* ========================================================= */
          /* MODO ATIVO: RECONHECIMENTO DE VOZ AO VIVO                */
          /* ========================================================= */
          <>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Comando de Voz AudioFlix</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
              Peça sua Música por Voz
            </h3>

            <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6">
              Diga o nome da música, cantor ou banda para tocar instantaneamente.
            </p>

            {/* Microfone Central com Anéis Pulsantes */}
            <div className="relative my-4 flex items-center justify-center">
              {isListening && (
                <>
                  <div className="absolute w-36 h-36 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />
                  <div className="absolute w-28 h-28 rounded-full bg-emerald-500/30 animate-pulse pointer-events-none" />
                </>
              )}

              <button
                type="button"
                onClick={handleToggleListening}
                className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer shadow-xl ${
                  isListening
                    ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 scale-110 shadow-emerald-500/30 ring-4 ring-emerald-500/40'
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 shadow-slate-950/60'
                }`}
                title={isListening ? 'Ouvindo agora (Clique para pausar)' : 'Clique para ativar o microfone'}
              >
                {isSearching ? (
                  <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-white" />
                ) : isListening ? (
                  <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 animate-bounce" />
                ) : (
                  <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
                )}
              </button>
            </div>

            {/* Ondas Sonoras Visuais enquanto ouve */}
            {isListening && (
              <div className="flex items-center gap-1.5 h-6 my-2">
                {[40, 75, 100, 60, 90, 45, 80, 60].map((height, i) => (
                  <div
                    key={i}
                    className="w-1 bg-emerald-400 rounded-full animate-pulse"
                    style={{
                      height: `${height}%`,
                      animationDelay: `${i * 120}ms`
                    }}
                  />
                ))}
              </div>
            )}

            {/* Status e Transcrição em Tempo Real */}
            <div className="min-h-[48px] my-3 flex flex-col items-center justify-center">
              {transcript ? (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Você disse:</span>
                  <p className="text-base sm:text-lg font-bold text-white px-4 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700">
                    "{transcript}"
                  </p>
                </div>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-slate-300">
                  {statusMessage}
                </p>
              )}

              {errorMessage && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Card da Música Encontrada e Conectada */}
            {foundTrack && (
              <div className="w-full max-w-sm mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 animate-in zoom-in-95">
                {foundTrack.artwork ? (
                  <img
                    src={foundTrack.artwork}
                    alt={foundTrack.title}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-md"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
                    <Music className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 text-left flex-1">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Conectando</span>
                  </div>
                  <h4 className="text-sm font-bold text-white truncate">{foundTrack.title}</h4>
                  <p className="text-xs text-slate-400 truncate">{foundTrack.artist}</p>
                </div>
              </div>
            )}

            {/* Sugestões Rápidas de Pedidos de Voz */}
            <div className="w-full mt-6 pt-5 border-t border-slate-800/80">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                Exemplos que você pode falar:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {[
                  'Tocar Evidências',
                  'Alok',
                  'Coldplay Yellow',
                  'Queen Bohemian Rhapsody',
                  'Imagine Dragons'
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleChipClick(sug)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-400 border border-slate-700/60 transition cursor-pointer active:scale-95"
                  >
                    "{sug}"
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
