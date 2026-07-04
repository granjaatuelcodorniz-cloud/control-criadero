// Cola durable de operaciones pendientes de sincronizar (IndexedDB).
// Sobrevive a cerrar la app / reiniciar el celu. Se vacía cuando vuelve la señal.

const DB_NAME = 'atuel-offline';
const STORE = 'mutations';
const DB_VERSION = 1;

export const QUEUE_EVENT = 'atuel-queue-changed';

export type QueuedMutation = {
  id: string;
  kind: string;
  payload: unknown;
  created_at: number;
};

export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

function notifyChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function enqueue(kind: string, payload: unknown): Promise<string> {
  const item: QueuedMutation = { id: nuevoId(), kind, payload, created_at: Date.now() };
  await run('readwrite', store => store.add(item));
  notifyChange();
  return item.id;
}

export async function getAll(): Promise<QueuedMutation[]> {
  const all = await run<QueuedMutation[]>('readonly', store => store.getAll());
  return (all ?? []).sort((a, b) => a.created_at - b.created_at);
}

export async function remove(id: string): Promise<void> {
  await run('readwrite', store => store.delete(id));
  notifyChange();
}

export async function count(): Promise<number> {
  return run<number>('readonly', store => store.count());
}
