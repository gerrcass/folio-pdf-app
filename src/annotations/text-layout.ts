import type { PdfQuad } from './types';
import { quadHeight, quadWidth } from '../pdf/geometry';

const NOTE_PADDING = 12;
const LINE_HEIGHT = 1.35;
const AVERAGE_GLYPH_WIDTH = 0.56;

export function estimateWrappedLines(text: string, width: number, fontSize: number): number {
  const maxWidth = Math.max(24, width - NOTE_PADDING);
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let line = '';
    let paragraphLines = 1;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length * fontSize * AVERAGE_GLYPH_WIDTH > maxWidth && line) {
        paragraphLines += 1;
        line = word;
      } else {
        line = candidate;
      }
    }
    lines += paragraphLines;
  }
  return Math.max(1, lines);
}

export function requiredNoteHeight(text: string, width: number, fontSize: number): number {
  return Math.max(58, estimateWrappedLines(text, width, fontSize) * fontSize * LINE_HEIGHT + NOTE_PADDING);
}

/**
 * Grow a text note downward in page space while keeping its top edge fixed.
 * `p3` is the visual top-left and `p0` the visual bottom-left.
 */
export function fitTextQuad(quad: PdfQuad, text: string, fontSize: number): PdfQuad {
  const width = quadWidth(quad);
  const currentHeight = quadHeight(quad);
  const height = Math.max(currentHeight, requiredNoteHeight(text, width, fontSize));
  if (height <= currentHeight + 0.5) return quad;
  const unitX = {
    x: (quad.p0.x - quad.p3.x) / Math.max(currentHeight, 0.001),
    y: (quad.p0.y - quad.p3.y) / Math.max(currentHeight, 0.001),
  };
  return {
    ...quad,
    p0: { x: quad.p3.x + unitX.x * height, y: quad.p3.y + unitX.y * height },
    p1: { x: quad.p2.x + unitX.x * height, y: quad.p2.y + unitX.y * height },
  };
}
