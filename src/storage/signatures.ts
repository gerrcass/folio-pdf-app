import { deleteRecord, getRecord, putRecord } from './db';
import type { RememberedSignature } from './types';

const KEY = 'remembered';

export async function loadRememberedSignature(): Promise<RememberedSignature | null> {
  return (await getRecord<RememberedSignature>('signatures', KEY)) ?? null;
}

export async function rememberSignature(dataUrl: string): Promise<void> {
  await putRecord<RememberedSignature>('signatures', {
    id: KEY,
    dataUrl,
    createdAt: Date.now(),
  });
}

export async function forgetRememberedSignature(): Promise<void> {
  await deleteRecord('signatures', KEY);
}
