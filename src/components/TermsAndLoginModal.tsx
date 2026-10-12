import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Sparkles,
  ArrowRight,
  Tv
} from 'lucide-react';
import { usePlaylistContext } from '../context/PlaylistContext.tsx';

interface TermsAndLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsAndLoginModal({ isOpen, onClose }: TermsAndLoginModalProps) {
  const {
    user,
    loginWithAccount,
    loginWithGoogle,
    logout,
    syncNow,
    isSyncing,
    favorites,
    playlists,
    downloads,
    showToast
  } = usePlaylistContext();

  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'google' | 'youtube'>('google');
  const [customName, setCustomName] = useState('');

  if (!isOpen) return null;

  // 1. Login Instantâneo com Google (Google Identity / Firebase Auth)
  const handleGoogleAuth = async () => {
    if (!acceptedTerms) {
      showToast('⚠️ Por favor, confirme o aceite dos termos.');
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = await loginWithGoogle();
      if (ok) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Login Instantâneo com YouTube
  const handleYouTubeAuth = async () => {
    if (!acceptedTerms) {
      showToast('⚠️ Por favor, confirme o aceite dos termos.');
      return;
    }
    setIsSubmitting(true);
    try {
      const name = customName.trim() || 'Usuário YouTube';
      const email = 'usuario.youtube@audioflix.app';
      const ok = await loginWithAccount({
        name,
        email,
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
        provider: 'youtube',
        termsAccepted: true
      });
      if (ok) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO COMPACTO */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">
                {user ? 'Sua Conta Conectada' : 'Acessar Conta & Sincronização'}
              </h2>
              <span className="text-[10px] text-emerald-400 font-medium block -mt-0.5">
                Playlists, favoritos e downloads salvos na nuvem
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO COMPACTO (100% SEM SCROLL) */}
        <div className="p-5 space-y-4">
          {user ? (
            /* USUÁRIO CONECTADO */
            <div className="space-y-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border-2 border-emerald-500/50 shrink-0 shadow-md">
                  <img
                    src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user.email)}`}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate">{user.name}</h3>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      Conectado
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>
              </div>

              {/* Estatísticas Compactas */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-1">
                  <span className="text-sm font-bold text-white block">{favorites.length}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Favoritos</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-1">
                  <span className="text-sm font-bold text-white block">{playlists.length}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Playlists</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg py-2 px-1">
                  <span className="text-sm font-bold text-white block">{downloads.length}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-semibold">Downloads</span>
                </div>
              </div>

              {/* Botões de Ação Rápidos */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => syncNow()}
                  disabled={isSyncing}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl text-xs font-semibold border border-rose-800/40 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          ) : (
            /* USUÁRIO NÃO CONECTADO: LOGIN ULTRA-RÁPIDO GOOGLE & YOUTUBE */
            <div className="space-y-3.5">
              {/* Seleção Compacta: Google vs YouTube */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('google')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'google'
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Conta Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('youtube')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'youtube'
                      ? 'bg-red-600/20 text-red-300 border border-red-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Conta YouTube</span>
                </button>
              </div>

              {/* ABA GOOGLE */}
              {activeTab === 'google' ? (
                <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white block">
                      Google Identity • Conexão Instantânea
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Clique abaixo para confirmar sua conta Google e ativar a sincronização imediata sem digitar senhas.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={!acceptedTerms || isSubmitting}
                    className="w-full py-3 bg-white hover:bg-slate-100 active:scale-[0.99] disabled:opacity-50 text-slate-900 font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2.5 cursor-pointer border border-slate-200"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                    )}
                    <span>{isSubmitting ? 'Conectando...' : 'Entrar com a Conta Google'}</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5 text-slate-700" />
                  </button>
                </div>
              ) : (
                /* ABA YOUTUBE */
                <div className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="space-y-1 text-center">
                    <span className="text-xs font-bold text-white block">
                      Conectar Conta YouTube
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Acesso rápido para salvar suas playlists e downloads no aparelho.
                    </p>
                  </div>

                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Seu nome ou apelido (opcional)"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />

                  <button
                    type="button"
                    onClick={handleYouTubeAuth}
                    disabled={!acceptedTerms || isSubmitting}
                    className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Tv className="w-4 h-4" />
                    )}
                    <span>{isSubmitting ? 'Conectando...' : 'Conectar Conta YouTube'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* CHECKBOX DE TERMOS ESSENCIAIS */}
              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-300 select-none pt-1">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer accent-emerald-500"
                />
                <span>
                  Aceito os termos para <strong>sincronizar playlists e downloads</strong> na nuvem entre dispositivos.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* RODAPÉ ULTRA COMPACTO */}
        <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1 text-[10px]">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>AudioFlix Cloud Sync</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition cursor-pointer text-xs font-semibold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
