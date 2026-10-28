import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  deleteDatabase,
  loadAnnotations,
  loadSession,
  markSessionNotRestorable,
  removeRecentDocument,
  saveAnnotations,
  saveRecentDocument,
  saveSession,
  listRecentDocuments,
  loadDocumentBytes,
} from '../src/storage';
import type { ReadingSession, RecentDocument } from '../src/storage/types';

function documentRecord(index: number): RecentDocument {
  return {
    id: `doc-${index}`,
    name: `Document ${index}.pdf`,
    title: `Document ${index}`,
    size: 1024,
    pageCount: 4,
    createdAt: index,
    lastOpened: index,
  };
}

function sessionFor(documentId: string): ReadingSession {
  return {
    id: 'last',
    documentId,
    page: 2,
    scrollTop: 300,
    zoomMode: 'fit-width',
    zoomValue: 1.2,
    rotation: 90,
    sidebarVisible: false,
    spreadMode: 'double',
    nightMode: true,
    restorable: true,
    updatedAt: 10,
  };
}

afterEach(async () => {
  await deleteDatabase();
});

describe('local library', () => {
  it('evicts the least-recently-opened document beyond the count limit', async () => {
    for (let index = 1; index <= 25; index += 1) {
      await saveRecentDocument(documentRecord(index), new ArrayBuffer(8));
    }
    const documents = await listRecentDocuments();
    expect(documents).toHaveLength(24);
    expect(documents.some((document) => document.id === 'doc-1')).toBe(false);
    expect(documents[0].id).toBe('doc-25');
    expect(await loadDocumentBytes('doc-1')).toBeNull();
    expect(await loadDocumentBytes('doc-25')).not.toBeNull();
  });

  it('keeps annotations and removes the matching session with a document', async () => {
    const document = documentRecord(1);
    await saveRecentDocument(document, new ArrayBuffer(8));
    await saveAnnotations(document.id, [
      {
        id: 'a1',
        kind: 'highlight',
        pageIndex: 0,
        color: 'amber',
        quads: [
          {
            p0: { x: 1, y: 1 },
            p1: { x: 2, y: 1 },
            p2: { x: 2, y: 2 },
            p3: { x: 1, y: 2 },
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    await saveSession(sessionFor(document.id));
    expect(await loadAnnotations(document.id)).toHaveLength(1);
    expect((await loadSession())?.page).toBe(2);

    await removeRecentDocument(document.id);
    expect(await listRecentDocuments()).toHaveLength(0);
    expect(await loadDocumentBytes(document.id)).toBeNull();
    expect(await loadAnnotations(document.id)).toHaveLength(0);
    expect(await loadSession()).toBeNull();
  });

  it('marks the last session as non-restorable without losing its position', async () => {
    await saveSession(sessionFor('doc-9'));
    await markSessionNotRestorable();
    const session = await loadSession();
    expect(session?.restorable).toBe(false);
    expect(session?.scrollTop).toBe(300);
    expect(session?.rotation).toBe(90);
  });

  it('reuses one database connection across operations', async () => {
    await closeDatabase();
    const document = documentRecord(2);
    await saveRecentDocument(document, new ArrayBuffer(8));
    await saveRecentDocument(documentRecord(3), new ArrayBuffer(8));
    expect((await listRecentDocuments()).length).toBe(2);
  });
});
