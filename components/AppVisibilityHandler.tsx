'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function AppVisibilityHandler() {
  useEffect(() => {
    const supabase = createClient();

    // Caso 1: navegador restauró la página desde bfcache (pestaña congelada).
    // Forzamos recarga completa para que React y Supabase se reinicialicen.
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    // Caso 2: el usuario vuelve a la pestaña después de tenerla inactiva.
    // El token de Supabase puede haber vencido en ese tiempo.
    // getSession() refresca el token automáticamente si es necesario,
    // dejando la sesión lista antes de que el usuario toque cualquier botón.
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await supabase.auth.getSession();
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