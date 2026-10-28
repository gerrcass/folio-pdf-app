import { deleteRecord, getRecord, putRecord } from './db';
import type { ReadingSession } from './types';

export const SESSION_KEY = 'last';

export async function loadSession(): Promise<ReadingSession | null> {
  const session = await getRecord<ReadingSession>('sessions', SESSION_KEY);
  return session ?? null;
}

export async function saveSession(session: ReadingSession): Promise<void> {
  await putRecord('sessions', session);
}

export async function markSessionNotRestorable(): Promise<void> {
  const session = await loadSession();
  if (!session) return;
  await saveSession({ ...session, restorable: false, updatedAt: Date.now() });
}

export async function deleteSession(): Promise<void> {
  await deleteRecord('sessions', SESSION_KEY);
}
