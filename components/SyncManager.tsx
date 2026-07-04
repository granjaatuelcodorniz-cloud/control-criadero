'use client';

import { useEffect, useState } from 'react';
import { flushQueue } from '@/lib/offline-sync';
import { count, QUEUE_EVENT } from '@/lib/offline-queue';

// Sincroniza la cola offline al cargar, al volver la señal y cada 30s.
// Muestra un chip flotante mientras haya cargas sin sincronizar.
export default function SyncManager() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const c = await count().catch(() => 0);
      if (mounted) setPending(c);
    };
    const doFlush = async () => { await flushQueue(); await refresh(); };

    refresh();
    doFlush();

    const onOnline = () => { doFlush(); };
    window.addEventListener('online', onOnline);
    window.addEventListener(QUEUE_EVENT, refresh);
    const interval = setInterval(doFlush, 30000);

    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener(QUEUE_EVENT, refresh);
      clearInterval(interval);
    };
  }, []);

  if (pending <= 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      {pending} pendiente{pending > 1 ? 's' : ''} de sincronizar
    </div>
  );
}
