'use client';

import { createContext, useCallback, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

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
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Garantiza que onAuthStateChange no interfiere mientras init() corre.
  const initialized = useRef(false);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error cargando perfil:', error);
      return null;
    }

    setProfile(data);
    return data;
  }, [supabase]);

  const redirectByRole = useCallback((role: Profile['role']) => {
    if (role === 'owner') {
      router.replace('/dashboard/admin');
    } else {
      router.replace('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (error) {
        console.error('Error iniciando sesión:', error);
      } finally {
        if (mounted) {
          initialized.current = true;
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          router.replace('/');
          return;
        }

        // Ignoramos eventos hasta que init() termine.
        if (!initialized.current) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const fetchedProfile = await fetchProfile(session.user.id);
          setLoading(false);
          if (fetchedProfile) {
            redirectByRole(fetchedProfile.role);
          }

        } else if (event === 'TOKEN_REFRESHED') {
          // El token se refrescó automáticamente — el usuario es el mismo.
          // No tocamos el estado de React para evitar re-renders que
          // disparan los useEffect de todas las páginas y causan loadings
          // innecesarios al volver de un cambio de pestaña.
        }
      }
    );

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, router, fetchProfile, redirectByRole]);

  const handleLogout = useCallback(async () => {
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    router.replace('/');
  }, [router, supabase]);

  const value = useMemo(
    () => ({ user, profile, loading, signOut: handleLogout }),
    [user, profile, loading, handleLogout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
