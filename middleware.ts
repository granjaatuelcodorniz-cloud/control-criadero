import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Creamos la respuesta base
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 2. Configuramos Supabase con permiso para escribir cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. Verificamos el usuario
  const { data: { user } } = await supabase.auth.getUser()

  // REGLA A: Si no hay usuario y quiere entrar al dashboard -> Al Login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // REGLA B: Si YA hay usuario y está en el Login -> Al Dashboard
  if (user && request.nextUrl.pathname === '/') {
    const role = user.user_metadata?.role || 'collaborator'; // Opcional si guardas rol en metadata
    const redirectUrl = role === 'owner' ? '/dashboard/admin' : '/dashboard';
    return NextResponse.redirect(new URL(redirectUrl, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico, logo.webp, manifest.json
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.webp|manifest.json).*)',
  ],
}