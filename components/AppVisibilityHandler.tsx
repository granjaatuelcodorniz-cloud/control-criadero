'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function AppVisibilityHandler() {
  useEffect(() => {
    const supabase = createClient();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // App volvió al primer plano — refrescar sesión
        await supabase.auth.getSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}