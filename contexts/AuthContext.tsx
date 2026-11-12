'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearActiveProfile, loadActiveProfile, loadProfile, saveProfile, type CachedProfile } from '@/lib/profile-cache';
import { isConnectionError } from '@/lib/connection';

type AuthState = {
  user: { id: string } | null;
  profile: CachedProfile | null;
  loading: boolean;
  error: string | null;
};

const initialState: AuthState = { user: null, profile: null, loading: true, error: null };
const AuthContext = createContext<AuthState & { retry: () => void; signOut: () => Promise<void> }>({
  ...initialState,
  retry: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount(value => value + 1), []);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    let currentUserId: string | null = null;
    let pendingAuthChange: ReturnType<typeof setTimeout> | undefined;

    function publish(userId: string | null, profile: CachedProfile | null, loading = false, error: string | null = null) {
      currentUserId = userId;
      setState(previous => ({
        user: userId ? (previous.user?.id === userId ? previous.user : { id: userId }) : null,
        profile: profile && previous.user?.id === userId && previous.profile?.role === profile.role
          && previous.profile.full_name === profile.full_name ? previous.profile : profile,
        loading, error,
      }));
    }

    function restoreOffline() {
      const saved = loadActiveProfile();
      publish(saved?.userId ?? null, saved?.profile ?? null);
    }

    async function loadFor(userId: string) {
      const request = ++revision;
      const cached = loadProfile(userId);
      const active = loadActiveProfile();
      if (active && active.userId !== userId) clearActiveProfile();
      if (cached) saveProfile(userId, cached);
      publish(userId, cached, !cached);

      try {
        const { data, error } = await supabase.from('profiles').select('full_name, role').eq('id', userId).single();
        if (error) throw error;
        if (!data || (data.role !== 'owner' && data.role !== 'collaborator')) throw new Error('Perfil inválido.');
        if (!mounted || request !== revision) return;
        saveProfile(userId, data);
        publish(userId, data);
      } catch (error) {
        if (!mounted || request !== revision) return;
        if (cached && (!navigator.onLine || isConnectionError(error))) publish(userId, cached);
        else {
          clearActiveProfile();
          publish(userId, null, false, 'No pudimos cargar tu perfil. Revisá la conexión e intentá de nuevo.');
        }
      }
    }

    async function restore() {
      const request = ++revision;
      if (!navigator.onLine) {
        restoreOffline();
        return;
      }

      const fallback = setTimeout(() => {
        if (mounted && request === revision && loadActiveProfile()) restoreOffline();
      }, 1500);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!mounted || request !== revision) return;
        if (session?.user) {
          await loadFor(session.user.id);
        } else if (!navigator.onLine || isConnectionError(error)) {
          restoreOffline();
        } else {
          clearActiveProfile();
          publish(null, null);
        }
      } catch {
        if (!mounted || request !== revision) return;
        restoreOffline();
      } finally {
        clearTimeout(fallback);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        clearTimeout(pendingAuthChange);
        revision++;
        clearActiveProfile();
        publish(null, null);
      } else if (event === 'SIGNED_IN' && session?.user && session.user.id !== currentUserId) {
        const userId = session.user.id;
        clearTimeout(pendingAuthChange);
        // Supabase puede mantener bloqueada la sesión hasta que termina este callback.
        pendingAuthChange = setTimeout(() => { if (mounted && userId !== currentUserId) void loadFor(userId); }, 0);
      }
    });

    const initial = setTimeout(() => { void restore(); }, 0);
    window.addEventListener('online', restore);
    return () => {
      mounted = false;
      clearTimeout(initial);
      clearTimeout(pendingAuthChange);
      window.removeEventListener('online', restore);
      subscription.unsubscribe();
    };
  }, [retryCount]);

  const signOut = useCallback(async () => {
    if (!navigator.onLine) throw new Error('Conectate a internet para cerrar sesión.');
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error('No se pudo cerrar sesión. Revisá la conexión e intentá de nuevo.');
    clearActiveProfile();
    router.replace('/');
  }, [router]);

  const value = useMemo(() => ({ ...state, retry, signOut }), [state, retry, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
