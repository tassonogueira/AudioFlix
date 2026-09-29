import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Inicializando AudioFlix...');
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 15;
        if (next >= 100) {
          clearInterval(timer);
          setStatusText('Pronto! Bem-vindo ao AudioFlix.');
          setTimeout(() => {
            setIsFadingOut(true);
            setTimeout(onFinish, 400);
          }, 300);
          return 100;
        }

        if (next > 70) {
          setStatusText('Configurando player de alta definição...');
        } else if (next > 40) {
          setStatusText('Carregando catálogo e discografias...');
        } else if (next > 20) {
          setStatusText('Preparando módulos de áudio...');
        }

        return next;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 bg-slate-950 transition-opacity duration-400 select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 left-1/3 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/4 w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full" />

      {/* Center Branding & Animated Logo (Sem botões ou opções de clique) */}
      <div className="flex flex-col items-center text-center space-y-6 max-w-md z-10 my-auto">
        {/* Animated Brand Emblem */}
        <div className="relative group">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 p-0.5 shadow-2xl shadow-emerald-500/30">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent" />
              <Play className="w-11 h-11 text-emerald-400 fill-emerald-400 ml-1 drop-shadow-md" />
            </div>
          </div>

          {/* Equalizer animation around badge */}
          <div className="flex items-end justify-center gap-1.5 mt-4 h-6">
            <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
            <span className="w-1 bg-emerald-300 rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-5" />
            <span className="w-1 bg-teal-400 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-6" />
            <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_1s_ease-in-out_infinite] h-4" />
            <span className="w-1 bg-emerald-500 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-2" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white flex items-center justify-center gap-1">
            <span>Audio</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
              Flix
            </span>
          </h1>
        </div>

        {/* Progress Bar & Status Text */}
        <div className="w-full space-y-2 pt-2">
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{statusText}</span>
            <span className="font-mono text-emerald-400 font-bold">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Note */}
      <div className="w-full max-w-4xl text-center z-10 pt-4">
        <p className="text-xs text-slate-500">
          AudioFlix • <span className="text-emerald-400 font-medium">by Tasso</span>
        </p>
      </div>
    </div>
  );
}
