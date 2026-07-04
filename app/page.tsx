'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { loadProfile, saveProfile } from '@/lib/profile-cache';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'set-password';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const router = useRouter();

  // Si ya hay sesión guardada (aunque esté offline), entrar directo sin pedir login.
  // Solo si tenemos el perfil cacheado, para saber el rol y no rebotar.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const cached = loadProfile(session.user.id);
      if (cached) router.replace(cached.role === 'owner' ? '/dashboard/admin' : '/dashboard');
    });
  }, [router]);

  // Detectar token de invitación en la URL (#access_token=...)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && (type === 'invite' || type === 'signup')) {
      const supabase = createClient();

      // Establecer sesión completa con access + refresh token
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      }).then(({ data }) => {
        if (data?.user?.email) {
          setInviteEmail(data.user.email);
          setMode('set-password');
          window.history.replaceState(null, '', window.location.pathname);
        }
      });
    }
  }, []);

  // ── Login normal ────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      const sinSenal = (typeof navigator !== 'undefined' && !navigator.onLine)
        || /fetch|network|failed|timeout|conexi/i.test(signInError?.message ?? '');
      setError(sinSenal
        ? 'Sin conexión. Necesitás internet para iniciar sesión la primera vez.'
        : 'Email o contraseña incorrectos. Verificá los datos.');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', data.user.id)
      .single();

    if (profile) saveProfile(data.user.id, profile);

    if (profile?.role === 'owner') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard');
    }
  };

  // ── Setear contraseña desde invitación ──────────────────────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError('Error al guardar la contraseña. Intentá de nuevo.');
      setLoading(false);
      return;
    }

    // Contraseña seteada — redirigir según rol
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Crear perfil si no existe (primer acceso)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'owner') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard');
    }
  };

  // ── Set password UI ─────────────────────────────────────────────────────────
  if (mode === 'set-password') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10">
          <div className="flex justify-center mb-8">
            <Image src="/logo.webp" alt="Granja Atuel" width={260} height={110} priority className="mx-auto" />
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">Bienvenida</h1>
          <p className="text-gray-500 text-center mb-1">ControlCriadero — Granja Atuel</p>
          {inviteEmail && (
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-2xl text-center px-4 py-2 mb-6 mt-3">
              {inviteEmail}
            </p>
          )}
          <p className="text-gray-500 text-center text-sm mb-8">
            Elegí una contraseña para tu cuenta
          </p>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Nueva contraseña (mín. 8 caracteres)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-base"
                required
                minLength={8}
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Repetir contraseña"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className="input-base"
                required
              />
            </div>

            {error && <p className="text-red-600 text-center text-sm">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-4 mt-2">
              {loading ? 'Guardando...' : 'Confirmar y entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Login UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10">
        <div className="flex justify-center mb-8">
          <Image src="/logo.webp" alt="Granja Atuel" width={260} height={110} priority className="mx-auto" />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">Iniciar sesión</h1>
        <p className="text-gray-500 text-center mb-8">ControlCriadero — Granja Atuel</p>

        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input-base"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input-base"
            required
          />

          {error && <p className="text-red-600 text-center text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full py-4">
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}