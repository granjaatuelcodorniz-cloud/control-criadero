'use client';

import { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
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

  // Este flag garantiza que onAuthStateChange no toque el loading
  // mientras init() todavía está corriendo.
  const initialized = useRef(false);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();
      if (data) {
        setProfile(data);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error cargando perfil:', error);
      return null;
    }
  };

  const redirectByRole = (role: Profile['role']) => {
    if (role === 'owner') {
      router.push('/dashboard/admin');
    } else {
      router.push('/dashboard');
    }
  };

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
          // Marcamos como inicializado ANTES de bajar el loading,
          // para que onAuthStateChange sepa que ya puede operar.
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
          router.push('/');
          return;
        }

        // Si init() todavía no terminó, ignoramos este evento.
        // init() ya se está ocupando de cargar el estado inicial.
        if (!initialized.current) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const fetchedProfile = await fetchProfile(session.user.id);
          setLoading(false);
          if (fetchedProfile) {
            redirectByRole(fetchedProfile.role);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      }
    );

    init();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  const handleLogout = async () => {
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}