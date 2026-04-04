'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Verificar si ya está logueado
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError('Email o contraseña incorrectos. Verificá los datos.');
        console.error(signInError);
      } else {
        // Si el login es exitoso, redirigimos manualmente
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Ocurrió un error al iniciar sesión');
      console.error(err);
    } finally {
      setLoading(false);
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
        <p className="text-gray-500 text-center mb-8">ControlCriadero - Granja Atuel</p>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:border-[#f9c74f]"
              placeholder="antonella@controlcriadero.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:border-[#f9c74f]"
              placeholder="Tu contraseña"
              required
            />
          </div>

          {error && <p className="text-red-600 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 text-xl font-semibold disabled:opacity-70"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          Prueba con Antonella
        </p>
      </div>
    </div>
  );
}