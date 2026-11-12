'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/lib/connection';
import { QUEUE_EVENT } from '@/lib/offline-queue';
import { flushQueue, getPendingOperations } from '@/lib/offline-sync';

export default function SyncManager() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const online = useOnlineStatus();
  const [status, setStatus] = useState<{ userId: string; pending: number; issue: string | null } | null>(null);

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
          const pending = await getPendingOperations(userId);
          if (!mounted) return;
          setStatus({ userId, pending: pending.length, issue: pending.find(item => item.sync_error)?.sync_error ?? null });
          if (!navigator.onLine || pending.length === 0) continue;
          await flushQueue(userId);
          const remaining = await getPendingOperations(userId);
          if (mounted) setStatus({ userId, pending: remaining.length, issue: remaining.find(item => item.sync_error)?.sync_error ?? null });
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
  const issue = status?.userId === userId ? status?.issue : null;
  if (!profile || !pathname.startsWith('/dashboard') || (online && pending === 0)) return null;

  return (
    <div role="status" className="fixed bottom-20 inset-x-4 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl border border-amber-300 bg-amber-100 px-3 py-1.5 text-center text-xs font-medium text-amber-900 shadow-lg">
      {!online && <span>Sin conexión{pending > 0 ? ' · ' : ''}</span>}
      {pending > 0 && <span>{pending} pendiente{pending > 1 ? 's' : ''} de sincronizar</span>}
      {issue && online && (
        <div>
          <span>{issue}</span>{' '}
          <button type="button" className="font-bold underline" onClick={() => window.dispatchEvent(new Event(QUEUE_EVENT))}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
