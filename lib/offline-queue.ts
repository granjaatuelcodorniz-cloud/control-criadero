// Las pestañas con la versión anterior pueden seguir usando su cola hasta recargarse.
const legacyDb = 'atuel-offline';
const currentDb = 'atuel-offline-v2';
const storeName = 'mutations';

export const QUEUE_EVENT = 'atuel-queue-changed';

type Mutation = { id: string; kind: string; payload: unknown; created_at: number };
export type QueuedMutation = Mutation & { database: string };

export function nuevoId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)), 0x40);
}

function uuidFromBytes(bytes: Uint8Array, version: number) {
  bytes[6] = (bytes[6] & 0x0f) | version;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function normalizeClientId(id: string) {
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return id;
  // Algunas versiones antiguas usaban un identificador local que no era UUID.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`control-criadero:${id}`));
  return uuidFromBytes(new Uint8Array(digest).slice(0, 16), 0x80);
}

function openDb(database: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(database: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb(database);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('El guardado local se interrumpió.'));
    });
  } finally {
    db.close();
  }
}

export async function enqueue(kind: string, payload: unknown): Promise<void> {
  const item: Mutation = { id: nuevoId(), kind, payload, created_at: Date.now() };
  await run(currentDb, 'readwrite', store => store.add(item));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function getAll(): Promise<QueuedMutation[]> {
  const results = await Promise.all([legacyDb, currentDb].map(async database => {
    const entries = await run<Mutation[]>(database, 'readonly', store => store.getAll());
    return entries.map(entry => ({ ...entry, database }));
  }));
  return results.flat().sort((a, b) => a.created_at - b.created_at);
}

export async function remove(item: QueuedMutation): Promise<void> {
  await run(item.database, 'readwrite', store => store.delete(item.id));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}
