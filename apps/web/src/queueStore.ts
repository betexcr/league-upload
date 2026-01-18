import type { QueueStore, UploadInit } from "@league/upload-core";

type DbInstance = IDBDatabase;

const DB_NAME = "league-upload";
const STORE_NAME = "kv";
const QUEUE_KEY = "uploadQueue";

const openDb = (): Promise<DbInstance> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IDB error"));
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("IDB error"));
  });
};

export const createIndexedDbQueueStore = (): QueueStore => {
  return {
    async load() {
      const result = await withStore<UploadInit[] | undefined>("readonly", (store) =>
        store.get(QUEUE_KEY)
      );
      return result ?? [];
    },
    async save(items) {
      await withStore("readwrite", (store) => store.put(items, QUEUE_KEY));
    },
    async clear() {
      await withStore("readwrite", (store) => store.delete(QUEUE_KEY));
    },
  };
};
