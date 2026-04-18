'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

type Profile = {
  full_name: string;
  role: 'owner' | 'collaborator';
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();
      if (data) setProfile(data);
    } catch (error) {
      console.error("Error cargando perfil:", error);
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    // Escuchamos los cambios de sesión de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        // LOGICA "MATADORA" DE LOADING:
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }

        // Si el evento es salida o carga inicial fallida, soltamos el loading sí o sí
        if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && session)) {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  // FUNCION SIGN OUT CON LIMPIEZA ATÓMICA
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      
      // Limpiamos los cachés del navegador para que Chrome no use datos viejos
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      
      // Limpieza de estados locales
      setUser(null);
      setProfile(null);
      
      // Redirección forzada limpiando el historial
      window.location.replace('/');
    } catch (error) {
      console.error("Error al salir:", error);
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de un AuthProvider');
  return context;
}