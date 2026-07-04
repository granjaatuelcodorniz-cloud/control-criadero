// Sincronización de la cola offline con Supabase.
// Idempotencia: cada registro lleva un client_uuid único; si al reintentar ya existe
// (violación de unique, código 23505), se considera ya sincronizado y se descarta.
// Si la columna client_uuid todavía no existe en la base (42703), inserta sin ella.

import { supabase } from '@/lib/supabase';
import { enqueue, getAll, remove, nuevoId } from '@/lib/offline-queue';

export type RecoleccionPayload = {
  client_uuid: string;
  date: string;
  user_id: string;
  bandejas_consumo: number;
  bandejas_fertiles: number;
  notas: string | null;
  registered_at: string;
};

// Distingue "no hay señal / request cortada" de un error real de base de datos.
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const err = error as { message?: string; code?: string } | null;
  if (err?.code) return false; // error de Postgres con código → NO es de red
  const msg = (err?.message ?? '').toLowerCase();
  return !msg || /fetch|network|failed|abort|timeout|conexi|offline/.test(msg);
}

async function insertDaily(p: RecoleccionPayload, withUuid: boolean) {
  const row: Record<string, unknown> = {
    date: p.date,
    user_id: p.user_id,
    bandejas_consumo: p.bandejas_consumo,
    bandejas_fertiles: p.bandejas_fertiles,
    docenas_armadas: 0,
    huevos_rotos: 0,
    notas: p.notas,
    registered_at: p.registered_at,
  };
  if (withUuid) row.client_uuid = p.client_uuid;
  return supabase.from('daily_records').insert(row);
}

async function applyRecoleccion(p: RecoleccionPayload) {
  let res = await insertDaily(p, true);
  if (res.error?.code === '42703') res = await insertDaily(p, false); // columna aún no creada
  if (res.error) {
    if (res.error.code === '23505') return; // ya sincronizado antes → ok
    throw res.error;
  }
  if (p.bandejas_fertiles > 0) {
    const { error } = await supabase.from('fertile_batches').insert(
      Array.from({ length: p.bandejas_fertiles }, () => ({ date: p.date, user_id: p.user_id, status: 'pendiente' })),
    );
    if (error) throw error;
  }
}

// Guarda la recolección: intenta online; si no hay señal, la mete en la cola.
export async function guardarRecoleccion(p: Omit<RecoleccionPayload, 'client_uuid'>): Promise<'online' | 'offline'> {
  const payload: RecoleccionPayload = { ...p, client_uuid: nuevoId() };
  try {
    await applyRecoleccion(payload);
    return 'online';
  } catch (e) {
    if (isOfflineError(e)) {
      await enqueue('recoleccion', payload);
      return 'offline';
    }
    throw e;
  }
}

let flushing = false;

// Vacía la cola hacia Supabase. Se detiene si vuelve a no haber señal (reintenta después).
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  try {
    const items = await getAll();
    for (const item of items) {
      try {
        if (item.kind === 'recoleccion') await applyRecoleccion(item.payload as RecoleccionPayload);
        await remove(item.id);
      } catch (e) {
        if (isOfflineError(e)) break; // sin señal → dejamos el resto para después
        break; // error inesperado → no perdemos el dato, reintenta luego
      }
    }
  } finally {
    flushing = false;
  }
}
