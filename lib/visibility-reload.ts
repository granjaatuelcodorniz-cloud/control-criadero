'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ── Recuperación al volver de segundo plano ─────────────────────────────────
//
// Cuando la pestaña queda en segundo plano (cambio de pestaña en la compu, o
// pantalla apagada en el celu), el navegador CONGELA la página: pausa timers y
// deja a medias el refresco de token de Supabase. Al volver:
//   1) El lock de auth puede quedar unos segundos ocupado (se auto-libera en
//      ≤5s por el timeout interno de Supabase), y
//   2) NADA vuelve a ejecutar la carga de datos de la página, así que la
//      pantalla se queda con la información vieja hasta refrescar a mano.
//
// Este hook cierra ese hueco: al volver a primer plano (o al recuperar señal)
//   • Reactiva el auto-refresh de sesión que pudo quedar frenado (refuerzo de
//     raíz), y
//   • Vuelve a ejecutar el loader de la página.
export function useVisibilityReload(reload: () => void | Promise<void>) {
  // Guardamos la última versión del loader en un ref para no re-suscribir el
  // listener en cada render (el loader suele recrearse por dependencias).
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // Evita disparos duplicados: visibilitychange + online pueden llegar juntos.
  const lastRun = useRef(0);

  useEffect(() => {
    const run = async () => {
      const now = Date.now();
      if (now - lastRun.current < 800) return;
      lastRun.current = now;

      // Refuerzo de sesión: despierta el refresco de token que pudo quedar
      // congelado. Lo acotamos a 3s para no demorar la recarga si se cuelga.
      try {
        await Promise.race([
          supabase.auth.startAutoRefresh(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Si el refuerzo falla, igual intentamos recargar: las consultas
        // resuelven su propio token.
      }

      void reloadRef.current();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    const onOnline = () => void run();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
