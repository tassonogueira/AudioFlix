import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Exibe quando rolar mais de 280 pixels
      if (window.scrollY > 280) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Subir ao topo da página"
      title="Subir ao topo da página"
      className="fixed bottom-24 sm:bottom-28 right-4 sm:right-6 z-40 p-3 sm:p-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-2xl shadow-emerald-950/80 border border-emerald-400/50 flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer group animate-in fade-in slide-in-from-bottom-4"
    >
      <ArrowUp className="w-5 h-5 sm:w-5 sm:h-5 transition-transform group-hover:-translate-y-0.5" />
      <span className="sr-only">Subir ao topo</span>
    </button>
  );
}
