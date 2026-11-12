import { supabase } from '@/lib/supabase';
import { enqueue, getAll, remove, nuevoId, normalizeClientId, type QueuedMutation } from '@/lib/offline-queue';
import { isConnectionError } from '@/lib/connection';

type RecoleccionPayload = {
  client_uuid: string;
  date: string;
  user_id: string;
  bandejas_consumo: number;
  bandejas_fertiles: number;
  notas: string | null;
  registered_at: string;
};

export const RECOLECCION_SYNCED = 'atuel-recoleccion-synced';

export async function getPendingRecolecciones(userId: string) {
  return (await getAll()).filter((item): item is QueuedMutation & { payload: RecoleccionPayload } => (
    item.kind === 'recoleccion' && (item.payload as RecoleccionPayload | null)?.user_id === userId
  ));
}

async function applyRecoleccion(payload: RecoleccionPayload) {
  const { error } = await supabase.rpc('registrar_recoleccion', {
    p_client_uuid: await normalizeClientId(payload.client_uuid),
    p_user_id: payload.user_id,
    p_date: payload.date,
    p_bandejas_consumo: payload.bandejas_consumo,
    p_bandejas_fertiles: payload.bandejas_fertiles,
    p_notas: payload.notas,
    p_registered_at: payload.registered_at,
  });
  if (error) throw error;
}

export async function guardarRecoleccion(payload: Omit<RecoleccionPayload, 'client_uuid'>): Promise<'online' | 'pending'> {
  const collection = { ...payload, client_uuid: nuevoId() };
  try {
    await enqueue('recoleccion', collection);
    return 'pending';
  } catch {
    if (!navigator.onLine) {
      throw new Error('El navegador no pudo guardar la recolección en este dispositivo. Conservamos lo que ingresaste.');
    }
    await applyRecoleccion(collection);
    return 'online';
  }
}

type SyncResult = 'waiting' | 'blocked' | 'done';
const inProgress = new Map<string, Promise<SyncResult>>();

async function syncPending(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) return 'waiting';
  let pending = await getPendingRecolecciones(userId);
  if (pending.length === 0) return 'done';
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== userId) return 'waiting';

  let blocked = false;
  let synced = false;
  const attempted = new Set<string>();
  try {
    while (pending.length > 0) {
      for (const item of pending) {
        attempted.add(item.id);
        try {
          await applyRecoleccion(item.payload);
          await remove(item);
          synced = true;
        } catch (error) {
          if (!navigator.onLine || isConnectionError(error)) return 'waiting';
          blocked = true;
        }
      }
      pending = (await getPendingRecolecciones(userId)).filter(item => !attempted.has(item.id));
    }
    return blocked ? 'blocked' : 'done';
  } finally {
    if (synced) window.dispatchEvent(new Event(RECOLECCION_SYNCED));
  }
}

export function flushQueue(userId: string): Promise<SyncResult> {
  const existing = inProgress.get(userId);
  if (existing) return existing;
  const run = syncPending(userId).finally(() => inProgress.delete(userId));
  inProgress.set(userId, run);
  return run;
}
