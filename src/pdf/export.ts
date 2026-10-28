import fontkit from '@pdf-lib/fontkit';
import noteFontUrl from '../../assets/fonts/DejaVuSans.ttf?url';
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import type { Annotation, InkAnnotation, PdfQuad, TextAnnotation } from '../annotations/types';
import { highlightHex } from '../annotations/types';
import { quadBBox, quadHeight, quadWidth, unionBBoxes } from './geometry';

export class ExportError extends Error {
  readonly code: 'encrypted' | 'invalid' | 'unsupported';

  constructor(code: 'encrypted' | 'invalid' | 'unsupported', message: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function pdfDate(date: Date): PDFString {
  const pad = (value: number) => String(value).padStart(2, '0');
  return PDFString.of(
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(
      date.getUTCHours(),
    )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`,
  );
}

function streamResources(
  pdfDoc: PDFDocument,
  options: {
    images?: Record<string, PDFImage>;
    font?: PDFFont;
    graphicsState?: PDFRef;
  },
): Record<string, unknown> {
  const resources: Record<string, unknown> = {};
  if (options.images && Object.keys(options.images).length > 0) {
    resources.XObject = Object.fromEntries(
      Object.entries(options.images).map(([name, image]) => [name, image.ref]),
    );
  }
  if (options.font) {
    resources.Font = { F1: options.font.ref };
  }
  if (options.graphicsState) {
    resources.ExtGState = { GS0: options.graphicsState };
  }
  return resources;
}

function appearanceStream(
  pdfDoc: PDFDocument,
  content: string,
  bbox: { x: number; y: number; width: number; height: number },
  resources: Record<string, unknown>,
): PDFRef {
  const stream = pdfDoc.context.flateStream(content, {
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height],
    Resources: resources,
  } as never);
  return pdfDoc.context.register(stream);
}

function addAnnotation(
  page: PDFPage,
  pdfDoc: PDFDocument,
  annotation: {
    subtype: 'Highlight' | 'Ink' | 'FreeText' | 'Stamp';
    rect: { x: number; y: number; width: number; height: number };
    appearance: PDFRef;
    extra?: Record<string, unknown>;
  },
  id: string,
  modifiedAt: number,
): void {
  const dict: Record<string, unknown> = {
    Type: 'Annot',
    Subtype: annotation.subtype,
    Rect: [
      annotation.rect.x,
      annotation.rect.y,
      annotation.rect.x + annotation.rect.width,
      annotation.rect.y + annotation.rect.height,
    ],
    F: 4,
    NM: PDFString.of(id),
    T: PDFString.of('Folio'),
    M: pdfDate(new Date(modifiedAt)),
    AP: { N: annotation.appearance },
    ...annotation.extra,
  };
  const ref = pdfDoc.context.register(pdfDoc.context.obj(dict as never));
  page.node.addAnnot(ref);
}

function quadPath(quad: PdfQuad): string {
  const point = (value: { x: number; y: number }) => `${value.x.toFixed(3)} ${value.y.toFixed(3)}`;
  return `${point(quad.p0)} m ${point(quad.p1)} l ${point(quad.p2)} l ${point(quad.p3)} l h`;
}

function pdfQuadPoints(quads: PdfQuad[]): number[] {
  const flat: number[] = [];
  for (const quad of quads) {
    // PDF QuadPoints order is upper-left, upper-right, lower-left, lower-right
    // in default user space (y up), which is not necessarily our screen-derived
    // p3/p2/p0/p1 order after page or viewer rotation.
    const points = [quad.p0, quad.p1, quad.p2, quad.p3];
    const descending = [...points].sort((a, b) => b.y - a.y || a.x - b.x);
    const upper = descending.slice(0, 2).sort((a, b) => a.x - b.x);
    const lower = descending.slice(2).sort((a, b) => a.x - b.x);
    flat.push(upper[0].x, upper[0].y, upper[1].x, upper[1].y, lower[0].x, lower[0].y, lower[1].x, lower[1].y);
  }
  return flat;
}

function exportHighlight(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotation: Extract<Annotation, { kind: 'highlight' }>,
): void {
  const color = hexToRgb(highlightHex(annotation.color));
  const bbox = unionBBoxes(annotation.quads.map(quadBBox));
  const state = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: 'ExtGState',
      ca: 0.35,
      CA: 0.35,
      BM: 'Multiply',
    }),
  );
  const content = [
    'q',
    '/GS0 gs',
    `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`,
    ...annotation.quads.map((quad) => `${quadPath(quad)} f`),
    'Q',
  ].join('\n');
  const resources = streamResources(pdfDoc, { graphicsState: state });
  const appearance = appearanceStream(pdfDoc, content, bbox, resources);
  addAnnotation(
    page,
    pdfDoc,
    {
      subtype: 'Highlight',
      rect: bbox,
      appearance,
      extra: {
        QuadPoints: pdfQuadPoints(annotation.quads),
        C: [color.r, color.g, color.b],
        CA: 0.35,
      },
    },
    annotation.id,
    annotation.updatedAt || annotation.createdAt,
  );
}

function exportInk(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotation: InkAnnotation,
): void {
  const color = hexToRgb(annotation.color);
  const points = annotation.strokes.flat();
  if (points.length === 0) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const pad = annotation.thickness / 2 + 1;
  const rect = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  const content = [
    'q',
    `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG`,
    `${annotation.thickness.toFixed(2)} w`,
    '1 J 1 j',
    ...annotation.strokes
      .filter((stroke) => stroke.length > 1)
      .map(
        (stroke) =>
          `${stroke[0].x.toFixed(3)} ${stroke[0].y.toFixed(3)} m ${stroke
            .slice(1)
            .map((point) => `${point.x.toFixed(3)} ${point.y.toFixed(3)} l`)
            .join(' ')} S`,
      ),
    'Q',
  ].join('\n');
  const resources = streamResources(pdfDoc, {});
  const appearance = appearanceStream(pdfDoc, content, rect, resources);
  addAnnotation(
    page,
    pdfDoc,
    {
      subtype: 'Ink',
      rect,
      appearance,
      extra: {
        C: [color.r, color.g, color.b],
        InkList: annotation.strokes.map((stroke) => stroke.flatMap((point) => [point.x, point.y])),
        BS: { W: 0, S: 'S' },
      },
    },
    annotation.id,
    annotation.updatedAt || annotation.createdAt,
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function exportText(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotation: TextAnnotation,
  font: PDFFont,
): void {
  const color = hexToRgb(annotation.color);
  const originalWidth = quadWidth(annotation.quad);
  const originalHeight = quadHeight(annotation.quad);
  if (originalWidth <= 0 || originalHeight <= 0) return;
  const padding = 6;
  const lines = annotation.text
    .split('\n')
    .flatMap((line) => wrapText(line, font, annotation.fontSize, Math.max(16, originalWidth - padding * 2)));
  const leading = annotation.fontSize * 1.35;
  const requiredHeight = padding * 2 + lines.length * leading;
  let quad = annotation.quad;
  if (requiredHeight > originalHeight) {
    const down = {
      x: (annotation.quad.p0.x - annotation.quad.p3.x) / originalHeight,
      y: (annotation.quad.p0.y - annotation.quad.p3.y) / originalHeight,
    };
    quad = {
      ...quad,
      p0: {
        x: annotation.quad.p3.x + down.x * requiredHeight,
        y: annotation.quad.p3.y + down.y * requiredHeight,
      },
      p1: {
        x: annotation.quad.p2.x + down.x * requiredHeight,
        y: annotation.quad.p2.y + down.y * requiredHeight,
      },
    };
  }
  const height = quadHeight(quad);
  const width = quadWidth(quad);
  const xAxis = {
    x: (quad.p2.x - quad.p3.x) / width,
    y: (quad.p2.y - quad.p3.y) / width,
  };
  const yAxisDown = {
    x: (quad.p0.x - quad.p3.x) / height,
    y: (quad.p0.y - quad.p3.y) / height,
  };
  const start = {
    x: quad.p3.x + xAxis.x * padding + yAxisDown.x * (padding + annotation.fontSize),
    y: quad.p3.y + xAxis.y * padding + yAxisDown.y * (padding + annotation.fontSize),
  };
  const bbox = quadBBox(quad);
  const content = [
    'q',
    '0.996 0.984 0.955 rg',
    `${quadPath(quad)} f`,
    'Q',
    'q',
    `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`,
    ...lines.map((line, index) => {
      const tx = start.x + yAxisDown.x * leading * index;
      const ty = start.y + yAxisDown.y * leading * index;
      return [
        'BT',
        `/F1 ${annotation.fontSize.toFixed(2)} Tf`,
        `${xAxis.x.toFixed(5)} ${xAxis.y.toFixed(5)} ${(-yAxisDown.x).toFixed(5)} ${(-yAxisDown.y).toFixed(
          5,
        )} ${tx.toFixed(3)} ${ty.toFixed(3)} Tm`,
        `${font.encodeText(line).toString()} Tj`,
        'ET',
      ].join('\n');
    }),
    'Q',
  ].join('\n');
  const resources = streamResources(pdfDoc, { font });
  const appearance = appearanceStream(pdfDoc, content, bbox, resources);
  addAnnotation(
    page,
    pdfDoc,
    {
      subtype: 'FreeText',
      rect: bbox,
      appearance,
      extra: {
        Contents: PDFHexString.fromText(annotation.text),
        C: [color.r, color.g, color.b],
        DA: PDFString.of(
          `/FolioNote ${annotation.fontSize.toFixed(2)} Tf ${color.r.toFixed(3)} ${color.g.toFixed(
            3,
          )} ${color.b.toFixed(3)} rg`,
        ),
        DR: pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict)?.lookup(PDFName.of('DR'), PDFDict),
        Q: 0,
      },
    },
    annotation.id,
    annotation.updatedAt || annotation.createdAt,
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new ExportError('unsupported', 'The signature image could not be read.');
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes('base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

async function exportSignature(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotation: Extract<Annotation, { kind: 'signature' }>,
): Promise<void> {
  const bytes = dataUrlToBytes(annotation.dataUrl);
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new ExportError('unsupported', 'The signature image is not a PNG.');
  }
  const image = await pdfDoc.embedPng(bytes);
  const bbox = quadBBox(annotation.quad);
  const content = [
    'q',
    `${(annotation.quad.p1.x - annotation.quad.p0.x).toFixed(3)} ${(
      annotation.quad.p1.y - annotation.quad.p0.y
    ).toFixed(3)} ${(annotation.quad.p3.x - annotation.quad.p0.x).toFixed(3)} ${(
      annotation.quad.p3.y - annotation.quad.p0.y
    ).toFixed(3)} ${annotation.quad.p0.x.toFixed(3)} ${annotation.quad.p0.y.toFixed(3)} cm`,
    '/Sig0 Do',
    'Q',
  ].join('\n');
  const resources = streamResources(pdfDoc, { images: { Sig0: image } });
  const appearance = appearanceStream(pdfDoc, content, bbox, resources);
  addAnnotation(
    page,
    pdfDoc,
    {
      subtype: 'Stamp',
      rect: bbox,
      appearance,
      extra: {
        Name: 'Draft',
        Contents: PDFString.of('Visual signature added with Folio. Not a digital certificate.'),
      },
    },
    annotation.id,
    annotation.updatedAt || annotation.createdAt,
  );
}


function ensureFreeTextResources(pdfDoc: PDFDocument, font: PDFFont): void {
  const context = pdfDoc.context;
  const existing = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  const acroForm = existing ?? context.obj({ Fields: context.obj([]) });
  if (!existing) {
    acroForm.set(PDFName.of('Fields'), context.obj([]));
    pdfDoc.catalog.set(PDFName.of('AcroForm'), acroForm);
  }
  const dr = acroForm.lookupMaybe(PDFName.of('DR'), PDFDict) ?? context.obj({});
  const fontDict = dr.lookupMaybe(PDFName.of('Font'), PDFDict) ?? context.obj({});
  fontDict.set(PDFName.of('FolioNote'), font.ref);
  dr.set(PDFName.of('Font'), fontDict);
  acroForm.set(PDFName.of('DR'), dr);
}

let noteFontBytes: Promise<ArrayBuffer> | null = null;

async function noteFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  try {
    noteFontBytes ??= fetch(noteFontUrl).then((response) => {
      if (!response.ok) throw new Error('Font asset unavailable');
      return response.arrayBuffer();
    });
    const bytes = await noteFontBytes;
    pdfDoc.registerFontkit(fontkit);
    return await pdfDoc.embedFont(new Uint8Array(bytes), { subset: true });
  } catch {
    noteFontBytes = null;
    return pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}

export async function exportAnnotatedPdf(
  originalBytes: ArrayBuffer,
  annotations: Annotation[],
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : '';
    if (name === 'EncryptedPDFError' || /encrypted/i.test(message)) {
      throw new ExportError(
        'encrypted',
        'This PDF is password-protected. Folio can read it, but exporting annotations requires an unprotected copy.',
      );
    }
    throw new ExportError('invalid', 'This PDF could not be prepared for export.');
  }

  const hasTextNotes = annotations.some((annotation) => annotation.kind === 'text');
  const font = hasTextNotes
    ? await noteFont(pdfDoc)
    : await pdfDoc.embedFont(StandardFonts.Helvetica);
  if (hasTextNotes) ensureFreeTextResources(pdfDoc, font);
  const pages = pdfDoc.getPages();
  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex];
    if (!page) continue;
    try {
      switch (annotation.kind) {
        case 'highlight':
          exportHighlight(pdfDoc, page, annotation);
          break;
        case 'ink':
          exportInk(pdfDoc, page, annotation);
          break;
        case 'text':
          exportText(pdfDoc, page, annotation, font);
          break;
        case 'signature':
          await exportSignature(pdfDoc, page, annotation);
          break;
      }
    } catch (error) {
      if (error instanceof ExportError) throw error;
      throw new ExportError(
        'unsupported',
        `The ${annotation.kind} annotation could not be written to the PDF.`,
      );
    }
  }

  try {
    return await pdfDoc.save();
  } catch {
    throw new ExportError('unsupported', 'The annotated PDF could not be written.');
  }
}

export function annotationCounts(annotations: Annotation[]): Record<string, number> {
  return annotations.reduce<Record<string, number>>((counts, annotation) => {
    counts[annotation.kind] = (counts[annotation.kind] ?? 0) + 1;
    return counts;
  }, {});
}
