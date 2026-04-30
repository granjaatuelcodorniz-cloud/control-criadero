'use client';

import { useEffect } from 'react';

export default function AppVisibilityHandler() {
  useEffect(() => {
    // pageshow con persisted:true = navegador restauró la página del bfcache
    // En ese caso forzamos recarga completa para que React y Supabase
    // vuelvan a inicializarse correctamente
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return null;
}