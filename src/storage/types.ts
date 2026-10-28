import type { Annotation } from '../annotations/types';

export interface RecentDocument {
  id: string;
  name: string;
  title?: string;
  size: number;
  pageCount: number;
  createdAt: number;
  lastOpened: number;
  thumbnail?: string;
}

export interface StoredDocumentBytes {
  id: string;
  bytes: ArrayBuffer;
}

export interface StoredAnnotations {
  documentId: string;
  annotations: Annotation[];
  updatedAt: number;
}

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page';
export type SpreadMode = 'single' | 'double';

export interface ReadingSession {
  id: 'last';
  documentId: string;
  page: number;
  scrollTop: number;
  zoomMode: ZoomMode;
  zoomValue: number;
  rotation: number;
  sidebarVisible: boolean;
  spreadMode: SpreadMode;
  nightMode: boolean;
  restorable: boolean;
  updatedAt: number;
}

export interface RememberedSignature {
  id: 'remembered';
  dataUrl: string;
  createdAt: number;
}

export type Theme = 'light' | 'dark';

export interface Preferences {
  theme: Theme;
  nightMode: boolean;
}

export interface LibrarySnapshot {
  documents: RecentDocument[];
  evicted: RecentDocument[];
}
