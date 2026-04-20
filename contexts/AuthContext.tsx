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
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
  // 1. Creamos una promesa que se resuelve sí o sí en 2 segundos
  const timeout = new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // 2. Intentamos traer la sesión, pero no esperamos para siempre
    const { data: { session } } = await Promise.race([
      supabase.auth.getSession(),
      timeout
    ]) as any;

    if (mounted && session?.user) {
      setUser(session.user);
      loadProfile(session.user.id); // Esto que corra de fondo
    }
  } catch (err) {
    console.error("Fallo al iniciar:", err);
  } finally {
    if (mounted) setLoading(false); // ¡ESTO LIBERA LA PANTALLA!
  }
};

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          return;
        }
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}