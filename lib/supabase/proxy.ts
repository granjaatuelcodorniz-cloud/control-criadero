import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: no agregar código entre createServerClient y getUser()
  // getUser() refresca el token si está por vencer — es el núcleo del proxy
  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesión intentando acceder al dashboard → redirigir al login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Con sesión en el login → redirigir al dashboard correcto según rol
  if (user && request.nextUrl.pathname === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const redirectUrl = profile?.role === 'owner'
      ? '/dashboard/admin'
      : '/dashboard'

    return NextResponse.redirect(new URL(redirectUrl, request.url))
  }

  // Deshabilitar caché en rutas autenticadas para evitar
  // que el navegador sirva páginas congeladas con estado desactualizado
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    supabaseResponse.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, max-age=0'
    )
    supabaseResponse.headers.set('Pragma', 'no-cache')
    supabaseResponse.headers.set('Expires', '0')
  }

  return supabaseResponse
}