'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

type Profile = { full_name: string; role: 'owner' | 'collaborator' };

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', userId).single();
    if (data) setProfile(data);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Timeout de 2.5s para que el celu no se quede pegado si no hay buena señal
      const timeout = new Promise((res) => setTimeout(res, 2500));
      
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          timeout
        ]) as any;

        if (mounted && session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setUser(null); setProfile(null);
      } else if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile, supabase.auth]);

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

export const useAuth = () => useContext(AuthContext);