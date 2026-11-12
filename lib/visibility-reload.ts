'use client';

import { useEffect, useRef } from 'react';

export function useVisibilityReload(reload: () => void | Promise<void>) {
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  useEffect(() => {
    let running = false;
    let requested = false;
    let lastRun = 0;
    let mounted = true;

    async function run(force = false) {
      if (!navigator.onLine || !mounted) return;
      if (running) {
        requested = true;
        return;
      }
      if (!force && Date.now() - lastRun < 800) return;
      running = true;
      try {
        do {
          requested = false;
          lastRun = Date.now();
          await reloadRef.current();
        } while (mounted && navigator.onLine && requested);
      } finally {
        running = false;
      }
    }

    const refresh = (force = false) => { void run(force).catch(error => console.error('Error al actualizar la pantalla:', error)); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onOnline = () => refresh(true);
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
