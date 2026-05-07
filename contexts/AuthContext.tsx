'use client';

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
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

  // Carga el perfil desde la tabla profiles y lo guarda en estado.
  // Devuelve el perfil para que quien lo llame pueda usarlo inmediatamente.
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

  // Redirige al destino correcto según el rol del usuario.
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
        // Siempre se ejecuta, sin importar si había sesión o no.
        // Esto evita el loading infinito en cualquier escenario.
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          router.push('/');

        } else if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const fetchedProfile = await fetchProfile(session.user.id);
          setLoading(false);
          // Con el perfil en mano, redirigimos según rol.
          // Esta es la pieza que faltaba para cerrar el flujo de login.
          if (fetchedProfile) {
            redirectByRole(fetchedProfile.role);
          }

        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
          setLoading(false);
        }
      }
    );

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