/**
 * Petit accès clé/valeur sur IndexedDB, sans dépendance externe.
 * IndexedDB est retenu plutôt que localStorage : quota bien plus large,
 * écriture asynchrone (pas de blocage du rendu) et données structurées.
 */

const DB_NAME = 'freepilot';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

export const isIndexedDbAvailable = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
};

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Base IndexedDB bloquée par un autre onglet.'));
  });

  // Une ouverture échouée ne doit pas rester en cache : on pourra réessayer.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

export const idbGet = <T>(key: string): Promise<T | undefined> =>
  runTransaction<T | undefined>('readonly', (store) => store.get(key) as IDBRequest<T | undefined>);

export const idbSet = async (key: string, value: unknown): Promise<void> => {
  await runTransaction('readwrite', (store) => store.put(value, key) as IDBRequest<IDBValidKey>);
};

export const idbDelete = async (key: string): Promise<void> => {
  await runTransaction('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
};
