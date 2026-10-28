const DB_NAME = 'folio';
const DB_VERSION = 1;

let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('documentBytes')) {
        db.createObjectStore('documentBytes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('annotations')) {
        db.createObjectStore('annotations', { keyPath: 'documentId' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('signatures')) {
        db.createObjectStore('signatures', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = null;
      reject(request.error ?? new Error('Could not open local storage.'));
    };
    request.onblocked = () => {
      connection = null;
      reject(new Error('Local storage is blocked by another Folio window.'));
    };
  });
  return connection;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was aborted.'));
  });
}

export async function getRecord<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return requestResult<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function getAllRecords<T>(store: string): Promise<T[]> {
  const db = await open();
  return requestResult<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function putRecord<T>(store: string, value: T): Promise<void> {
  const db = await open();
  const transaction = db.transaction(store, 'readwrite');
  transaction.objectStore(store).put(value);
  await transactionDone(transaction);
}

export async function deleteRecord(store: string, key: IDBValidKey): Promise<void> {
  const db = await open();
  const transaction = db.transaction(store, 'readwrite');
  transaction.objectStore(store).delete(key);
  await transactionDone(transaction);
}

export async function clearStore(store: string): Promise<void> {
  const db = await open();
  const transaction = db.transaction(store, 'readwrite');
  transaction.objectStore(store).clear();
  await transactionDone(transaction);
}

export async function closeDatabase(): Promise<void> {
  if (!connection) return;
  try {
    const db = await connection;
    db.close();
  } finally {
    connection = null;
  }
}

export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete local storage.'));
    request.onblocked = () => resolve();
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  return open();
}
