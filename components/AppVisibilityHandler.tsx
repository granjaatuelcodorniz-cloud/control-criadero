'use client';

import { useEffect } from 'react';

export default function AppVisibilityHandler() {
  useEffect(() => {
    // Caso 1: navegador restauró la página desde bfcache (pestaña congelada).
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    // Caso 2: el usuario vuelve a la pestaña.
    // Recargamos la página completa para garantizar que React y Supabase
    // tengan el estado correcto — es el comportamiento que ya funciona bien.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.location.reload();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}