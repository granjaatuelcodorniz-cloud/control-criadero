import { supabase } from '@/lib/supabase';
import { enqueue, getAll, markSyncError, remove, nuevoId, normalizeClientId, type QueuedMutation } from '@/lib/offline-queue';
import { isConnectionError } from '@/lib/connection';
import { isWorkOperation, refreshWork, WORK_SYNCED, type WorkKind, type WorkOperation, type WorkPayloads } from '@/lib/trabajo';

type RecoleccionPayload = {
  client_uuid: string;
  date: string;
  user_id: string;
  bandejas_consumo: number;
  bandejas_fertiles: number;
  notas: string | null;
  registered_at: string;
};
type RecoleccionOperation = { kind: 'recoleccion'; payload: RecoleccionPayload };
type OfflineOperation = RecoleccionOperation | WorkOperation;
type QueuedOperation = QueuedMutation & OfflineOperation;

export const RECOLECCION_SYNCED = 'atuel-recoleccion-synced';

export async function getPendingOperations(userId: string): Promise<QueuedOperation[]> {
  return (await getAll()).filter((item): item is QueuedOperation => (
    (item.kind === 'recoleccion' || isWorkOperation(item))
    && (item.payload as { user_id?: string } | null)?.user_id === userId
  ));
}

export async function getPendingRecolecciones(userId: string) {
  return (await getPendingOperations(userId)).filter(item => item.kind === 'recoleccion');
}

async function applyOperation(operation: OfflineOperation) {
  if (operation.kind === 'recoleccion') {
    const { payload } = operation;
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
    return;
  }

  const args = {
    p_id: operation.payload.client_uuid,
    p_user_id: operation.payload.user_id,
    p_date: operation.payload.date,
    p_recorded_at: operation.payload.recorded_at,
  };
  if (operation.kind === 'tarea_nueva') {
    const { error } = await supabase.rpc('agregar_tarea_propia', { ...args, p_description: operation.payload.description });
    if (error) throw error;
  } else if (operation.kind === 'tarea_estado') {
    const { task, completed } = operation.payload;
    const { error } = await supabase.rpc('guardar_estado_tarea', {
      ...args, p_task_id: typeof task === 'number' ? task : null,
      p_task_uuid: typeof task === 'string' ? task : null, p_completed: completed,
    });
    if (error) throw error;
  } else {
    const { lot_id, slot_id, slot_code, quantity, reason, loss_type } = operation.payload;
    const { error } = await supabase.rpc('registrar_baja_boca', {
      ...args, p_lot_id: lot_id, p_slot_id: slot_id, p_slot_code: slot_code,
      p_quantity: quantity, p_reason: reason, p_loss_type: loss_type,
    });
    if (error) throw error;
  }
}

async function saveOperation(operation: OfflineOperation, storageError: string): Promise<'online' | 'pending'> {
  try {
    await enqueue(operation.kind, operation.payload);
    return 'pending';
  } catch {
    if (!navigator.onLine) throw new Error(storageError);
    await applyOperation(operation);
    if (operation.kind !== 'recoleccion') {
      await refreshWork(operation.payload.user_id).catch(() => undefined);
      window.dispatchEvent(new Event(WORK_SYNCED));
    }
    return 'online';
  }
}

export function guardarRecoleccion(payload: Omit<RecoleccionPayload, 'client_uuid'>) {
  return saveOperation({ kind: 'recoleccion', payload: { ...payload, client_uuid: nuevoId() } },
    'El navegador no pudo guardar la recolección en este dispositivo. Conservamos lo que ingresaste.');
}

type WorkArguments = { [K in WorkKind]: [kind: K, payload: Omit<WorkPayloads[K], 'client_uuid' | 'recorded_at'>] }[WorkKind];

export function guardarTrabajo(...[kind, payload]: WorkArguments) {
  const metadata = { client_uuid: nuevoId(), recorded_at: new Date().toISOString() };
  const message = 'No pudimos guardar la carga en este dispositivo. Conservamos lo que ingresaste.';
  if (kind === 'tarea_nueva') return saveOperation({ kind, payload: { ...payload, ...metadata } }, message);
  if (kind === 'tarea_estado') return saveOperation({ kind, payload: { ...payload, ...metadata } }, message);
  return saveOperation({ kind, payload: { ...payload, ...metadata } }, message);
}

const inProgress = new Map<string, Promise<void>>();

function syncErrorMessage(error: unknown): string {
  const info = error as { code?: string; message?: string } | null;
  if ((info?.code === 'P0001' || info?.code === '22023') && info.message) return info.message;
  return 'No se pudo enviar una de las cargas. Probá reintentar.';
}

async function syncPending(userId: string): Promise<void> {
  if (!navigator.onLine) return;
  let pending = await getPendingOperations(userId);
  if (pending.length === 0) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== userId) return;

  let syncedCollection = false;
  const appliedWork: QueuedOperation[] = [];
  const attempted = new Set<string>();
  const blockedTasks = new Set<number | string>();
  try {
    while (pending.length > 0) {
      for (const item of pending) {
        attempted.add(item.id);
        const task = item.kind === 'tarea_estado' ? item.payload.task
          : item.kind === 'tarea_nueva' ? item.payload.client_uuid : null;
        if (task !== null && blockedTasks.has(task)) continue;

        try {
          await applyOperation(item);
          if (item.kind === 'recoleccion') {
            await remove(item);
            syncedCollection = true;
          } else appliedWork.push(item);
        } catch (error) {
          if (!navigator.onLine || isConnectionError(error)) return;
          await markSyncError(item, syncErrorMessage(error));
          if (task !== null) blockedTasks.add(task);
        }
      }
      pending = (await getPendingOperations(userId)).filter(item => !attempted.has(item.id));
    }

    if (appliedWork.length > 0) {
      try {
        // Conservá las cargas locales hasta que también esté actualizado el estado sin conexión.
        await refreshWork(userId);
      } catch (error) {
        console.error('No se pudo actualizar la copia local luego de sincronizar:', error);
        return;
      }
      for (const item of appliedWork) await remove(item);
      window.dispatchEvent(new Event(WORK_SYNCED));
    }
  } finally {
    if (syncedCollection) window.dispatchEvent(new Event(RECOLECCION_SYNCED));
  }
}

export function flushQueue(userId: string): Promise<void> {
  const existing = inProgress.get(userId);
  if (existing) return existing;
  const sync = async () => {
    if (navigator.locks) await navigator.locks.request(`atuel-sync-${userId}`, () => syncPending(userId));
    else await syncPending(userId);
  };
  const run = sync().finally(() => inProgress.delete(userId));
  inProgress.set(userId, run);
  return run;
}
