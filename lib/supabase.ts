import { createBrowserClient } from '@supabase/ssr'

// Instancia única global — se crea una sola vez cuando carga la app.
// createBrowserClient está diseñado para ser usado como singleton en el browser.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)