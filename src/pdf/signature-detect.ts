import type { PdfQuad } from '../annotations/types';
import { pdfRectToQuad } from '../pdf/geometry';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface SignatureTarget {
  id: string;
  label: string;
  source: 'widget' | 'label';
  quad: PdfQuad;
  fieldName?: string;
}

interface RawAnnotation {
  id?: string;
  subtype?: string;
  fieldType?: string;
  fieldName?: string | null;
  fieldValue?: unknown;
  rect?: number[];
  exportValue?: unknown;
}

interface RawTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

const LABEL_PATTERN = /\b(signature|sign here|signed by|authorized signature|signatory|sign below)\b/i;


export function detectSignatureTargetsFromData(
  annotations: RawAnnotation[],
  textItems: RawTextItem[],
  pageView: number[],
): SignatureTarget[] {
  const targets: SignatureTarget[] = [];
  const pageWidth = pageView[2] - pageView[0];

  for (const annotation of annotations) {
    if (annotation.subtype !== 'Widget' || annotation.fieldType !== 'Sig') continue;
    if (
      annotation.fieldValue !== undefined &&
      annotation.fieldValue !== null &&
      annotation.fieldValue !== ''
    ) {
      continue;
    }
    const rect = annotation.rect;
    if (!rect || rect.length !== 4) continue;
    const width = Math.abs(rect[2] - rect[0]);
    const height = Math.abs(rect[3] - rect[1]);
    if (width < 4 || height < 4) continue;
    const x = Math.min(rect[0], rect[2]);
    const y = Math.min(rect[1], rect[3]);
    targets.push({
      id: `widget_${annotation.id ?? annotation.fieldName ?? targets.length}`,
      label: annotation.fieldName ? `${annotation.fieldName} signature field` : 'Unsigned signature field',
      source: 'widget',
      quad: pdfRectToQuad({ x, y, width, height }),
      fieldName: annotation.fieldName ?? undefined,
    });
  }

  if (targets.length > 0) return targets;

  const widgetBounds = targets.map((target) => {
    const xs = [target.quad.p0.x, target.quad.p1.x, target.quad.p2.x, target.quad.p3.x];
    const ys = [target.quad.p0.y, target.quad.p1.y, target.quad.p2.y, target.quad.p3.y];
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  });

  for (const item of textItems) {
    const text = item.str?.trim() ?? '';
    const words = text.split(/\s+/).filter(Boolean);
    if (!text || text.length > 48 || words.length > 5 || !LABEL_PATTERN.test(text)) continue;
    if (/[.!?]\s*$/.test(text) && !/^sign here[.!]?$/i.test(text)) continue;
    const transform = item.transform;
    if (!transform || transform.length < 6) continue;
    const fontSize = Math.max(7, Math.abs(transform[3]) || Math.abs(transform[0]) || 10);
    const itemWidth = Math.max(item.width ?? 0, fontSize * Math.min(text.length, 24) * 0.48);
    const x = transform[4];
    const y = transform[5] - fontSize * 0.25;
    const width = Math.min(Math.max(itemWidth + 150, 180), pageWidth * 0.48);
    const height = Math.max(46, fontSize * 2.2);
    let targetX = x + itemWidth + 18;
    let targetY = y;
    if (targetX + width > pageView[2]) {
      targetX = Math.max(pageView[0] + 12, x);
      targetY = Math.max(pageView[1] + 12, y - height - 12);
    }
    const rect = {
      x: Math.max(pageView[0], Math.min(targetX, pageView[2] - width)),
      y: Math.max(pageView[1], Math.min(targetY, pageView[3] - height)),
      width,
      height,
    };
    const nearWidget = widgetBounds.some(
      (bounds) =>
        rect.x < bounds.x + bounds.width + 90 &&
        rect.x + rect.width > bounds.x - 90 &&
        rect.y < bounds.y + bounds.height + 90 &&
        rect.y + rect.height > bounds.y - 90,
    );
    if (nearWidget) continue;
    targets.push({
      id: `label_${targets.length}_${text.slice(0, 24)}`,
      label: `Near “${text.slice(0, 42)}”`,
      source: 'label',
      quad: pdfRectToQuad(rect),
    });
    if (targets.length >= 5) break;
  }

  return targets;
}

export async function findSignatureTargets(page: PDFPageProxy): Promise<SignatureTarget[]> {
  const [annotations, textContent] = await Promise.all([
    page.getAnnotations({ intent: 'display' }).catch(() => [] as RawAnnotation[]),
    page.getTextContent().catch(() => ({ items: [] as RawTextItem[] })),
  ]);
  return detectSignatureTargetsFromData(
    annotations as RawAnnotation[],
    textContent.items as RawTextItem[],
    page.view,
  );
}
