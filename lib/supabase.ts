import { createBrowserClient } from '@supabase/ssr'

// Timeout defensivo para toda request de Supabase.
// En el celu, con señal floja, una request (típicamente el refresco de token)
// puede quedar colgada y nunca resolver. Mientras está colgada bloquea el lock
// de auth y TODAS las llamadas siguientes se cuelgan → hay que reiniciar la app.
// Abortándola a los 15s, el lock se libera y la app se recupera sola.
const REQUEST_TIMEOUT_MS = 15000

function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Respetar un signal externo (p. ej. el de supabase-js .abortSignal()).
  if (init?.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout))
}

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchConTimeout } },
  )

// Este es el "puente" para que las 19 páginas sigan vivas por ahora
export const supabase = createClient()
