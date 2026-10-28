import type { Annotation } from '../annotations/types';
import { getRecord, putRecord } from './db';
import type { StoredAnnotations } from './types';

export async function loadAnnotations(documentId: string): Promise<Annotation[]> {
  const record = await getRecord<StoredAnnotations>('annotations', documentId);
  return record?.annotations ?? [];
}

export async function saveAnnotations(documentId: string, annotations: Annotation[]): Promise<void> {
  await putRecord<StoredAnnotations>('annotations', {
    documentId,
    annotations,
    updatedAt: Date.now(),
  });
}
