'use client';

import { useEffect } from 'react';

// Registra el service worker (solo en producción; en dev interfiere con el HMR).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      const build = encodeURIComponent(process.env.NEXT_PUBLIC_OFFLINE_BUILD ?? 'initial');
      void navigator.serviceWorker.register(`/sw.js?build=${build}`, { updateViaCache: 'none' }).catch(() => {
        // Si falla el registro, la app sigue funcionando con conexión.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    window.addEventListener('online', register);
    return () => {
      window.removeEventListener('load', register);
      window.removeEventListener('online', register);
    };
  }, []);

  return null;
}
