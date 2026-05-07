'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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
      setError('Email o contraseña incorrectos. Verificá los datos.');
      setLoading(false);
      return;
    }

    // Con el usuario autenticado, consultamos su perfil para saber a dónde redirigir.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profile?.role === 'owner') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard');
    }
    // No hacemos setLoading(false) acá: el botón queda en "Ingresando..."
    // mientras Next.js navega, lo cual es la experiencia correcta.
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10">
        <div className="flex justify-center mb-8">
          <Image
            src="/logo.webp"
            alt="Granja Atuel"
            width={260}
            height={110}
            priority
            className="mx-auto"
          />
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