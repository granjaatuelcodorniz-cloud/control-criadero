'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/lib/connection';
import { QUEUE_EVENT } from '@/lib/offline-queue';
import { flushQueue, getPendingRecolecciones } from '@/lib/offline-sync';

export default function SyncManager() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const online = useOnlineStatus();
  const [status, setStatus] = useState<{ userId: string; pending: number; blocked: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    let running = false;
    let requested = false;

    async function run() {
      if (!userId || !mounted) return;
      if (running) {
        requested = true;
        return;
      }
      running = true;
      try {
        do {
          requested = false;
          const pending = (await getPendingRecolecciones(userId)).length;
          if (!mounted) return;
          setStatus(previous => ({ userId, pending, blocked: previous?.userId === userId && previous.blocked }));
          if (!navigator.onLine || pending === 0) continue;
          const result = await flushQueue(userId);
          const remaining = (await getPendingRecolecciones(userId)).length;
          if (mounted) setStatus({ userId, pending: remaining, blocked: result === 'blocked' });
        } while (requested && mounted);
      } catch (error) {
        console.error('No se pudo consultar la sincronización local:', error);
      } finally {
        running = false;
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    void run();
    window.addEventListener('online', run);
    window.addEventListener('pageshow', run);
    window.addEventListener(QUEUE_EVENT, run);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(onVisible, 30000);
    return () => {
      mounted = false;
      window.removeEventListener('online', run);
      window.removeEventListener('pageshow', run);
      window.removeEventListener(QUEUE_EVENT, run);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [userId]);

  const pending = status?.userId === userId ? status?.pending ?? 0 : 0;
  const blocked = !!status?.blocked && status.userId === userId && pending > 0;
  if (!profile || !pathname.startsWith('/dashboard') || (online && pending === 0)) return null;

  return (
    <div role="status" className="fixed bottom-20 inset-x-4 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl border border-amber-300 bg-amber-100 px-3 py-1.5 text-center text-xs font-medium text-amber-900 shadow-lg">
      {!online && <span>Sin conexión{pending > 0 ? ' · ' : ''}</span>}
      {pending > 0 && <span>{pending} pendiente{pending > 1 ? 's' : ''} de sincronizar</span>}
      {blocked && online && (
        <div>
          <span>Hay recolecciones que requieren revisión.</span>{' '}
          <button type="button" className="font-bold underline" onClick={() => window.dispatchEvent(new Event(QUEUE_EVENT))}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
