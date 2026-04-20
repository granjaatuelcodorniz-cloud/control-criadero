'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AppVisibilityHandler() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Solo actuamos cuando la app vuelve a estar visible
      if (document.visibilityState === 'visible') {
        try {
          // Usamos getSession con un timeout implícito o rápido
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error("Error al recuperar sesión al volver:", error.message);
            return;
          }

          // Si la sesión desapareció mientras la app estaba en segundo plano,
          // mandamos al usuario al inicio para que no vea una pantalla rota.
          if (!session) {
            router.replace('/');
          }
        } catch (err) {
          console.error("Fallo crítico al despertar la app:", err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, supabase.auth]);

  return null;
}