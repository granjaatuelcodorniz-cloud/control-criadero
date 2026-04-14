'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import Image from 'next/image';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError('Email o contraseña incorrectos. Verificá los datos.');
      setLoading(false);
      return;
    }

    if (data.user) {
      // Obtener perfil para redirigir al lugar correcto
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile?.role === 'owner') {
        window.location.href = '/dashboard/admin';
      } else {
        window.location.href = '/dashboard';
      }
    }
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
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-base"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-base"
              placeholder="Tu contraseña"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-center text-sm font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 text-xl font-semibold disabled:opacity-70"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}