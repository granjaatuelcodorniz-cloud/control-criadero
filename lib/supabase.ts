import { createBrowserClient } from '@supabase/ssr'

// createBrowserClient maneja internamente el caso SSR.
// El singleton es seguro porque Next.js solo ejecuta este módulo
// en el cliente cuando se importa desde componentes 'use client'.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)