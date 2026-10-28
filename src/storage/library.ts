import { openDatabase, requestResult, transactionDone } from './db';
import type { LibrarySnapshot, RecentDocument, StoredDocumentBytes } from './types';

export const MAX_RECENT_DOCUMENTS = 24;
export const MAX_LIBRARY_BYTES = 200 * 1024 * 1024;

export async function listRecentDocuments(): Promise<RecentDocument[]> {
  const db = await openDatabase();
  const documents = await requestResult<RecentDocument[]>(
    db.transaction('documents', 'readonly').objectStore('documents').getAll(),
  );
  return documents.sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function getRecentDocument(id: string): Promise<RecentDocument | undefined> {
  const db = await openDatabase();
  return requestResult<RecentDocument | undefined>(
    db.transaction('documents', 'readonly').objectStore('documents').get(id),
  );
}

export async function loadDocumentBytes(id: string): Promise<ArrayBuffer | null> {
  const db = await openDatabase();
  const record = await requestResult<StoredDocumentBytes | undefined>(
    db.transaction('documentBytes', 'readonly').objectStore('documentBytes').get(id),
  );
  return record?.bytes ?? null;
}

async function deleteRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDatabase();
  const transaction = db.transaction(['documents', 'documentBytes', 'annotations'], 'readwrite');
  const documents = transaction.objectStore('documents');
  const bytes = transaction.objectStore('documentBytes');
  const annotations = transaction.objectStore('annotations');
  for (const id of ids) {
    documents.delete(id);
    bytes.delete(id);
    annotations.delete(id);
  }
  await transactionDone(transaction);
}

export async function pruneLibrary(currentDocumentId?: string): Promise<RecentDocument[]> {
  const documents = await listRecentDocuments();
  const evicted: RecentDocument[] = [];
  let count = documents.length;
  let totalBytes = documents.reduce((sum, document) => sum + document.size, 0);

  for (const document of [...documents].reverse()) {
    if (count <= MAX_RECENT_DOCUMENTS && totalBytes <= MAX_LIBRARY_BYTES) break;
    if (document.id === currentDocumentId) continue;
    evicted.push(document);
    count -= 1;
    totalBytes -= document.size;
  }

  await deleteRecords(evicted.map((document) => document.id));
  return evicted;
}

export async function saveRecentDocument(
  document: RecentDocument,
  bytes: ArrayBuffer,
): Promise<LibrarySnapshot> {
  const db = await openDatabase();
  const write = async () => {
    const transaction = db.transaction(['documents', 'documentBytes'], 'readwrite');
    transaction.objectStore('documents').put(document);
    transaction.objectStore('documentBytes').put({ id: document.id, bytes } satisfies StoredDocumentBytes);
    await transactionDone(transaction);
  };

  try {
    await write();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
    await pruneLibrary(document.id);
    await write();
  }

  const evicted = await pruneLibrary(document.id);
  return { documents: await listRecentDocuments(), evicted };
}

export async function touchDocument(id: string, lastOpened = Date.now()): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('documents', 'readwrite');
  const store = transaction.objectStore('documents');
  const record = await requestResult<RecentDocument | undefined>(store.get(id));
  if (record) {
    record.lastOpened = lastOpened;
    store.put(record);
  }
  await transactionDone(transaction);
}

export async function saveThumbnail(id: string, thumbnail: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('documents', 'readwrite');
  const store = transaction.objectStore('documents');
  const record = await requestResult<RecentDocument | undefined>(store.get(id));
  if (record) {
    record.thumbnail = thumbnail;
    store.put(record);
  }
  await transactionDone(transaction);
}

export async function removeRecentDocument(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(['documents', 'documentBytes', 'annotations', 'sessions'], 'readwrite');
  transaction.objectStore('documents').delete(id);
  transaction.objectStore('documentBytes').delete(id);
  transaction.objectStore('annotations').delete(id);
  const sessionStore = transaction.objectStore('sessions');
  const session = await requestResult<{ id: string; documentId?: string } | undefined>(sessionStore.get('last'));
  if (session?.documentId === id) sessionStore.delete('last');
  await transactionDone(transaction);
}

export async function getLibrarySize(documents: RecentDocument[]): Promise<number> {
  return documents.reduce((sum, document) => sum + document.size, 0);
}

export async function estimateQuota(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  if (typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') return null;
  return { usage: estimate.usage, quota: estimate.quota };
}
