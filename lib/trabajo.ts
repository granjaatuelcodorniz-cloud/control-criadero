import { getToday, toDateStr } from '@/lib/date';
import type { LossType, QuickLot, QuickSlot } from '@/lib/domain';
import { getAll, type QueuedMutation } from '@/lib/offline-queue';
import { supabase } from '@/lib/supabase';

export type TaskRef = number | string;
export type Task = {
  id: TaskRef;
  description: string;
  type: 'daily' | 'periodic' | 'custom';
  frequency_days: number | null;
  next_execution: string | null;
  is_urgent: boolean | null;
};
export type WorkLot = QuickLot & { start_date: string; initial_quantity: number; status: string };
type ServerTask = Omit<Task, 'id'> & { id: number; client_uuid: string | null };
type Snapshot = {
  userId: string;
  capturedAt: string;
  tasks: ServerTask[];
  completions: { task_id: number; date: string }[];
  lots: WorkLot[];
  slots: QuickSlot[];
  applied: string[];
};

type WorkPayload = { user_id: string; client_uuid: string; date: string; recorded_at: string };
export type WorkPayloads = {
  tarea_nueva: WorkPayload & { description: string };
  tarea_estado: WorkPayload & { task: TaskRef; completed: boolean };
  baja: WorkPayload & {
    lot_id: number; slot_id: number; slot_code: string; quantity: number; reason: string | null; loss_type: LossType;
  };
};
export type WorkKind = keyof WorkPayloads;
export type WorkOperation = { [K in WorkKind]: { kind: K; payload: WorkPayloads[K] } }[WorkKind];
export type QueuedWork = QueuedMutation & WorkOperation;
export const WORK_UPDATED = 'atuel-work-updated';
export const WORK_SYNCED = 'atuel-work-synced';
export const workCacheKey = (userId: string) => `atuel-trabajo-v1-${userId}`;
const memory = new Map<string, Snapshot>();

export function isWorkOperation(item: QueuedMutation): item is QueuedWork {
  return item.kind === 'tarea_nueva' || item.kind === 'tarea_estado' || item.kind === 'baja';
}

export function readWork(userId: string): Snapshot | null {
  const local = memory.get(userId) ?? null;
  try {
    const stored = localStorage.getItem(workCacheKey(userId));
    const snapshot = stored ? JSON.parse(stored) as Snapshot : null;
    return snapshot?.userId === userId && (!local || snapshot.capturedAt >= local.capturedAt) ? snapshot : local;
  } catch {
    return local;
  }
}

export async function getPendingWork(userId: string): Promise<QueuedWork[]> {
  return (await getAll()).filter(isWorkOperation).filter(item => item.payload?.user_id === userId);
}

export async function refreshWork(userId: string, date = getToday()): Promise<Snapshot> {
  const pending = await getPendingWork(userId).catch(() => []);
  const { data, error } = await supabase.rpc('cargar_trabajo_colaboradora', {
    p_date: date,
    p_pending: pending.map(item => item.payload.client_uuid),
  });
  if (error) throw error;
  if (!data || data.userId !== userId) throw new Error('La sesión cambió mientras se actualizaban las tareas y las bocas.');

  const previous = readWork(userId);
  if (previous && previous.capturedAt > data.capturedAt) return previous;
  const snapshot = data as Snapshot;
  memory.set(userId, snapshot);
  try {
    localStorage.setItem(workCacheKey(userId), JSON.stringify(snapshot));
  } catch {
    // En esta sesión seguimos usando los datos nuevos si el navegador limita el almacenamiento.
    try { localStorage.removeItem(workCacheKey(userId)); } catch { /* almacenamiento deshabilitado */ }
  }
  window.dispatchEvent(new Event(WORK_UPDATED));
  return snapshot;
}

function nextDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return toDateStr(next);
}

export function projectWork(snapshot: Snapshot | null, pending: QueuedWork[], today: string) {
  const tasks = new Map<TaskRef, Task>();
  const refs = new Map<number, TaskRef>();
  const completions = new Map<TaskRef, Set<string>>();
  const lots = new Map((snapshot?.lots ?? []).map(lot => [lot.id, lot]));
  const slots = new Map((snapshot?.slots ?? []).map(slot => [slot.id, slot]));
  const applied = new Set(snapshot?.applied);
  const pendingTasks = new Set<TaskRef>();

  for (const { id, client_uuid, ...task } of snapshot?.tasks ?? []) {
    const ref = client_uuid ?? id;
    refs.set(id, ref);
    tasks.set(ref, { ...task, id: ref });
  }

  for (const { task_id, date } of snapshot?.completions ?? []) {
    const ref = refs.get(task_id) ?? task_id;
    const dates = completions.get(ref) ?? new Set<string>();
    dates.add(date);
    completions.set(ref, dates);
  }

  for (const entry of pending) {
    if (entry.sync_error || applied.has(entry.payload.client_uuid)) continue;
    if (entry.kind === 'tarea_nueva') {
      const { client_uuid, description, date } = entry.payload;
      tasks.set(client_uuid, { id: client_uuid, description, type: 'custom', frequency_days: null, next_execution: date, is_urgent: false });
      pendingTasks.add(client_uuid);
    } else if (entry.kind === 'tarea_estado') {
      const { task: ref, completed, date } = entry.payload;
      const dates = completions.get(ref) ?? new Set<string>();
      const wasComplete = dates.has(date);
      if (completed) dates.add(date);
      else dates.delete(date);
      completions.set(ref, dates);
      pendingTasks.add(ref);

      const task = tasks.get(ref);
      if (task?.type === 'periodic' && task.frequency_days && task.frequency_days > 0) {
        const next = nextDate(date, task.frequency_days);
        if (completed && (!task.next_execution || task.next_execution <= date)) {
          tasks.set(ref, { ...task, next_execution: next, is_urgent: false });
        } else if (!completed && wasComplete && task.next_execution === next && ![...dates].some(day => day > date)) {
          tasks.set(ref, { ...task, next_execution: date });
        }
      }
    } else {
      const { lot_id, slot_id, slot_code, quantity } = entry.payload;
      const slot = slots.get(slot_id);
      const lot = lots.get(lot_id);
      if (!slot || !lot || slot.lot_id !== lot_id || slot.slot_code !== slot_code
        || slot.quantity < quantity || lot.current_quantity < quantity) continue;
      lots.set(lot_id, { ...lot, current_quantity: lot.current_quantity - quantity });
      if (slot.quantity === quantity) slots.delete(slot_id);
      else slots.set(slot_id, { ...slot, quantity: slot.quantity - quantity });
    }
  }

  const visibleTasks = [...tasks.values()].filter(task => {
    const dates = completions.get(task.id);
    if (task.type === 'custom') return !dates || ![...dates].some(date => date < today);
    if (task.type === 'periodic') return dates?.has(today) || (task.next_execution !== null && task.next_execution <= today);
    return true;
  });

  return {
    tasks: visibleTasks,
    completedIds: visibleTasks.filter(task => completions.get(task.id)?.has(today)).map(task => task.id),
    pendingTasks,
    slots: [...slots.values()],
    lots: [...lots.values()],
  };
}
