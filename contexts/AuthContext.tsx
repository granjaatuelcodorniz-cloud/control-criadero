'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
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

  // Función para cargar el perfil del usuario
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();
      if (data) setProfile(data);
    } catch (error) {
      console.error('Error cargando perfil:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // PASO 1: getSession() es casi instantáneo (lee cookies/storage)
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
          if (mounted) setLoading(false);

          // PASO 2: Verificación de seguridad en segundo plano
          const { data: { user: validatedUser } } = await supabase.auth.getUser();
          if (!mounted) return;
          
          if (!validatedUser) {
            setUser(null);
            setProfile(null);
            window.location.href = '/';
          }
        } else {
          setUser(null);
          setProfile(null);
          if (mounted) setLoading(false);
        }
      } catch (error) {
        console.error('Error iniciando sesión:', error);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    init();

    // --- FIX PARA DESPERTAR LA APP ---
    // Esta función se ejecuta cuando el usuario vuelve a la pestaña
    const handleWakeUp = () => {
      if (mounted) {
        // Re-validamos la sesión para romper cualquier estado "congelado"
        init();
      }
    };

    window.addEventListener('focus', handleWakeUp);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWakeUp();
    });

    // Suscripción a cambios de estado de Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user);
            await fetchProfile(session.user.id);
            setLoading(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('focus', handleWakeUp);
      document.removeEventListener('visibilitychange', handleWakeUp);
    };
  }, [fetchProfile]);

  const signOut = async () => {
    setUser(null);
    setProfile(null);
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