'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AppVisibilityHandler() {
  const router = useRouter();

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return

      try {
        // createClient() fresco cada vez — nunca usar instancia cacheada
        // getUser() valida contra el servidor, a diferencia de getSession()
        const supabase = createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
          router.replace('/')
        }
      } catch (err) {
        console.error('Error al verificar sesión al volver a la app:', err)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])

  return null
}