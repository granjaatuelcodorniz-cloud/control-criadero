import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storageKey: 'cc-auth-token',
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    }
  )
}

export const supabase = createClient()