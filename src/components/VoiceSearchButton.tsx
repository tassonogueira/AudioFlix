import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceSearchButtonProps {
  onTranscript: (query: string) => void;
  onOpenVoiceModal?: () => void;
  className?: string;
  buttonSize?: 'sm' | 'md' | 'lg';
}

export default function VoiceSearchButton({
  onTranscript,
  onOpenVoiceModal,
  className = '',
  buttonSize = 'md'
}: VoiceSearchButtonProps) {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        setIsListening(false);

        if (transcript.trim()) {
          // Limpa frases de comando comuns em português
          let cleaned = transcript.trim();
          cleaned = cleaned.replace(/^(tocar|toca|ouvir|ouça|coloque|coloca|pesquise|pesquisar|busca|buscar)\s+/i, '');
          cleaned = cleaned.replace(/\s+(por favor|pra mim)$/i, '');
          onTranscript(cleaned.trim() || transcript.trim());
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('Erro no reconhecimento de voz:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch {
      setIsSupported(false);
    }

    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch {}
    };
  }, [onTranscript]);

  const handleClick = () => {
    if (onOpenVoiceModal) {
      onOpenVoiceModal();
      return;
    }

    if (!isSupported) {
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  const sizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 sm:p-2.5 text-sm',
    lg: 'p-3 text-base'
  }[buttonSize];

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative rounded-xl font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 ${sizeClasses} ${
        isListening
          ? 'bg-rose-600 text-white shadow-rose-500/40 animate-pulse'
          : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-400 border border-slate-700'
      } ${className}`}
      title={
        isListening
          ? 'Ouvindo... Fale a música ou artista'
          : 'Pedir música por comando de voz (Microfone)'
      }
    >
      {isListening ? (
        <>
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <Mic className="w-4 h-4 text-white animate-bounce" />
          <span className="text-xs font-bold hidden sm:inline">Ouvindo...</span>
        </>
      ) : (
        <>
          <Mic className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold hidden md:inline">Voz</span>
        </>
      )}
    </button>
  );
}
