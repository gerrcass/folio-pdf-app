export interface PdfPoint {
  x: number;
  y: number;
}

/** Four corners in PDF user space: bottom-left, bottom-right, top-right, top-left. */
export interface PdfQuad {
  p0: PdfPoint;
  p1: PdfPoint;
  p2: PdfPoint;
  p3: PdfPoint;
}

export interface AnnotationBase {
  id: string;
  pageIndex: number;
  createdAt: number;
  updatedAt: number;
}

export type HighlightColor = 'amber' | 'rose' | 'sage' | 'sky' | 'violet';

export interface HighlightAnnotation extends AnnotationBase {
  kind: 'highlight';
  color: HighlightColor;
  quads: PdfQuad[];
}

export interface InkAnnotation extends AnnotationBase {
  kind: 'ink';
  color: string;
  thickness: number;
  strokes: PdfPoint[][];
}

export interface TextAnnotation extends AnnotationBase {
  kind: 'text';
  color: string;
  fontSize: number;
  quad: PdfQuad;
  text: string;
}

export interface SignatureAnnotation extends AnnotationBase {
  kind: 'signature';
  quad: PdfQuad;
  dataUrl: string;
  label?: string;
}

export type Annotation = HighlightAnnotation | InkAnnotation | TextAnnotation | SignatureAnnotation;

export const HIGHLIGHT_COLORS: ReadonlyArray<{ id: HighlightColor; label: string; hex: string }> = [
  { id: 'amber', label: 'Amber', hex: '#e0a63b' },
  { id: 'rose', label: 'Rose', hex: '#d46b72' },
  { id: 'sage', label: 'Sage', hex: '#7fa889' },
  { id: 'sky', label: 'Sky', hex: '#6f9fc4' },
  { id: 'violet', label: 'Violet', hex: '#9b87bf' },
];

export const INK_COLORS = ['#1b1a17', '#b55330', '#386f8f', '#4f7a5a', '#8b4b62'] as const;
export const TEXT_COLORS = ['#1b1a17', '#b55330', '#386f8f', '#4f7a5a', '#6b5a8d'] as const;

export function highlightHex(color: HighlightColor): string {
  return HIGHLIGHT_COLORS.find((entry) => entry.id === color)?.hex ?? HIGHLIGHT_COLORS[0].hex;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function createAnnotationBase(pageIndex: number): Pick<AnnotationBase, 'id' | 'pageIndex' | 'createdAt' | 'updatedAt'> {
  const now = Date.now();
  return {
    id: `ann_${crypto.randomUUID()}`,
    pageIndex,
    createdAt: now,
    updatedAt: now,
  };
}
