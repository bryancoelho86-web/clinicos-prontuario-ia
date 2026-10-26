import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'clinicos_sidebar_colapsada';

function detectarModo() {
  if (window.matchMedia('(max-width: 767px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 1023px)').matches) return 'tablet';
  return 'desktop';
}

function lerPreferenciaSalva() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo === 'true') return true;
    if (salvo === 'false') return false;
  } catch {
    // localStorage indisponível (modo privado etc) — sem preferência salva, usa padrão por modo.
  }
  return null;
}

function colapsoPadrao(modo) {
  return modo === 'tablet';
}

export function useResponsiveNav() {
  const [modo, setModo] = useState(() => (typeof window === 'undefined' ? 'desktop' : detectarModo()));
  const [colapsada, setColapsada] = useState(() => {
    if (typeof window === 'undefined') return false;
    const salvo = lerPreferenciaSalva();
    return salvo === null ? colapsoPadrao(detectarModo()) : salvo;
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(max-width: 1023px)');
    const atualizar = () => {
      const novoModo = detectarModo();
      setModo(novoModo);
      const salvo = lerPreferenciaSalva();
      if (salvo === null) setColapsada(colapsoPadrao(novoModo));
    };
    mobileQuery.addEventListener('change', atualizar);
    tabletQuery.addEventListener('change', atualizar);
    return () => {
      mobileQuery.removeEventListener('change', atualizar);
      tabletQuery.removeEventListener('change', atualizar);
    };
  }, []);

  const alternarColapso = useCallback(() => {
    setColapsada((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(STORAGE_KEY, String(novo));
      } catch {
        // localStorage indisponível — preferência só não persiste entre sessões.
      }
      return novo;
    });
  }, []);

  return { modo, colapsada, alternarColapso };
}
