'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOnlineStatus } from '@/lib/connection';
import { QUEUE_EVENT } from '@/lib/offline-queue';
import { getPendingWork, projectWork, readWork, refreshWork, WORK_UPDATED, workCacheKey, type QueuedWork } from '@/lib/trabajo';
import { useVisibilityReload } from '@/lib/visibility-reload';

type LocalWork = { userId: string; snapshot: ReturnType<typeof readWork>; pending: QueuedWork[] };

export function useTrabajo(userId: string | undefined, today: string) {
  const online = useOnlineStatus();
  const [local, setLocal] = useState<LocalWork | null>(null);
  const [failedUserId, setFailedUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    try {
      await refreshWork(userId, today);
      setFailedUserId(null);
    } catch (error) {
      setFailedUserId(userId);
      console.error('No se pudieron actualizar las tareas y las bocas:', error);
    }
  }, [userId, today]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let request = 0;
    const read = async () => {
      const id = ++request;
      const pending = await getPendingWork(userId).catch(() => []);
      if (alive && id === request) setLocal({ userId, snapshot: readWork(userId), pending });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === workCacheKey(userId)) void read();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void read(); };

    void read();
    window.addEventListener(QUEUE_EVENT, read);
    window.addEventListener(WORK_UPDATED, read);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', read);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_EVENT, read);
      window.removeEventListener(WORK_UPDATED, read);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', read);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useVisibilityReload(refresh);

  const current = local?.userId === userId ? local : null;
  const work = useMemo(() => projectWork(current?.snapshot ?? null, current?.pending ?? [], today), [current, today]);
  const failed = !!userId && failedUserId === userId;
  return {
    ...work,
    available: !!current?.snapshot,
    loading: !!userId && (!current || (online && !current.snapshot && !failed)),
    failed,
    refresh,
  };
}
