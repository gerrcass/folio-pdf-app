import type { Annotation } from '../../annotations/types';
import type { PageMetrics, PdfDocumentSession } from '../../pdf/document';
import type { ReadingSession, RecentDocument } from '../../storage';

export type ReaderTool = 'select' | 'highlight' | 'ink' | 'text';

export interface OpenedDocument {
  session: PdfDocumentSession;
  recent: RecentDocument;
  metrics: PageMetrics[];
  annotations: Annotation[];
  initialSession: ReadingSession | null;
  openedAt: number;
}
