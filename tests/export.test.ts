import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from 'pdf-lib';
import type { Annotation } from '../src/annotations/types';
import { exportAnnotatedPdf, ExportError } from '../src/pdf/export';
import { quadFromScreenRect } from '../src/pdf/geometry';

const sample = fs.readFileSync('tests/fixtures/sample.pdf');
const original = sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength) as ArrayBuffer;
const signature =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAKCAYAAACuaZ5oAAAAMklEQVR4nGNgGAX0BiJC/P+R+SzUNhAdMFJq2Jt3H/GagVeSHANxWkANw/ACQmE5aAEAT3EPpAHvGfIAAAAASUVORK5CYII=';

const annotations: Annotation[] = [
  {
    id: 'highlight-1',
    kind: 'highlight',
    pageIndex: 0,
    color: 'amber',
    quads: [
      {
        p0: { x: 54, y: 600 },
        p1: { x: 300, y: 600 },
        p2: { x: 300, y: 615 },
        p3: { x: 54, y: 615 },
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'ink-1',
    kind: 'ink',
    pageIndex: 0,
    color: '#b55330',
    thickness: 2.5,
    strokes: [
      [
        { x: 100, y: 400 },
        { x: 140, y: 430 },
        { x: 180, y: 410 },
      ],
    ],
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'text-1',
    kind: 'text',
    pageIndex: 0,
    color: '#1b1a17',
    fontSize: 12,
    quad: {
      p0: { x: 100, y: 250 },
      p1: { x: 340, y: 250 },
      p2: { x: 340, y: 300 },
      p3: { x: 100, y: 300 },
    },
    text: 'Check the geometry here.',
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: 'signature-1',
    kind: 'signature',
    pageIndex: 0,
    dataUrl: signature,
    quad: {
      p0: { x: 200, y: 120 },
      p1: { x: 460, y: 120 },
      p2: { x: 460, y: 210 },
      p3: { x: 200, y: 210 },
    },
    label: 'ReaderSignature',
    createdAt: 4,
    updatedAt: 4,
  },
];

async function annotsOf(
  bytes: Uint8Array,
  pageIndex = 0,
): Promise<{ pdf: PDFDocument; refs: ReturnType<PDFArray['asArray']> }> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(pageIndex);
  const array = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  return { pdf, refs: array?.asArray() ?? [] };
}

describe('native annotation export', () => {
  it('writes Highlight, Ink, FreeText, and transparent Stamp annotations with appearances', async () => {
    const exported = await exportAnnotatedPdf(original, annotations);
    const { pdf, refs } = await annotsOf(exported);
    expect(refs).toHaveLength(4);
    const types: string[] = [];
    let sawTransparency = false;
    for (const ref of refs) {
      const annot = pdf.context.lookup(ref, PDFDict);
      const subtype = annot.get(PDFName.of('Subtype'))?.toString() ?? '';
      types.push(subtype);
      expect(annot.get(PDFName.of('Rect'))).toBeDefined();
      expect(annot.get(PDFName.of('AP'))).toBeDefined();
      expect(annot.get(PDFName.of('NM'))).toBeDefined();
      if (subtype === '/Stamp') {
        const ap = annot.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'));
        const stream = pdf.context.lookup(ap as never) as unknown as PDFRawStream;
        const resources = stream.dict.lookup(PDFName.of('Resources'), PDFDict);
        const xobjects = resources.lookup(PDFName.of('XObject'), PDFDict);
        expect(xobjects).toBeDefined();
        const imageStreams = pdf.context
          .enumerateIndirectObjects()
          .map(([, object]) => object)
          .filter(
            (object): object is PDFRawStream =>
              object instanceof PDFRawStream &&
              object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image',
          );
        expect(imageStreams.some((stream) => stream.dict.get(PDFName.of('SMask')) !== undefined)).toBe(true);
        sawTransparency = true;
      }
    }
    expect(types.sort()).toEqual(['/FreeText', '/Highlight', '/Ink', '/Stamp']);
    expect(sawTransparency).toBe(true);

    const loadingTask = getDocument({ data: new Uint8Array(exported), disableWorker: true } as never);
    const parsed = await loadingTask.promise;
    const page = await parsed.getPage(1);
    const parsedAnnotations = await page.getAnnotations();
    const parsedTypes = parsedAnnotations.map((annotation) => annotation.subtype).sort();
    expect(parsedTypes).toEqual(['FreeText', 'Highlight', 'Ink', 'Stamp']);
    await parsed.loadingTask.destroy();
  });


  it('orders QuadPoints correctly for a rotated page with a nonzero CropBox', async () => {
    const rotatedBytes = fs.readFileSync('tests/fixtures/rotated-cropbox.pdf');
    const bytes = rotatedBytes.buffer.slice(
      rotatedBytes.byteOffset,
      rotatedBytes.byteOffset + rotatedBytes.byteLength,
    ) as ArrayBuffer;
    const loadingTask = getDocument({ data: new Uint8Array(bytes.slice(0)), disableWorker: true } as never);
    const source = await loadingTask.promise;
    const page = await source.getPage(1);
    const viewport = page.getViewport({ scale: 1.4, rotation: page.rotate });
    const quad = quadFromScreenRect({ x: 40, y: 60, width: 180, height: 36 }, viewport as never);
    await source.loadingTask.destroy();

    const exported = await exportAnnotatedPdf(bytes, [
      {
        id: 'rotated-highlight',
        kind: 'highlight',
        pageIndex: 0,
        color: 'sky',
        quads: [quad],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const { pdf, refs } = await annotsOf(exported);
    const annot = pdf.context.lookup(refs[0], PDFDict);
    const quadPoints = annot
      .lookup(PDFName.of('QuadPoints'), PDFArray)
      .asArray()
      .map((value) => Number(value.toString()));
    expect(quadPoints).toHaveLength(8);
    // upper-left, upper-right, lower-left, lower-right
    expect(quadPoints[1]).toBeGreaterThanOrEqual(quadPoints[5]);
    expect(quadPoints[3]).toBeGreaterThanOrEqual(quadPoints[7]);
    expect(quadPoints[0]).toBeLessThan(quadPoints[2]);
    expect(quadPoints[4]).toBeLessThan(quadPoints[6]);
  });

  it('embeds a real Unicode font when the export font asset is available', async () => {
    const fontBytes = fs.readFileSync('assets/fonts/DejaVuSans.ttf');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(fontBytes, { status: 200, headers: { 'content-type': 'font/ttf' } })) as typeof fetch;
    try {
      const exported = await exportAnnotatedPdf(original, [
        {
          id: 'unicode-note',
          kind: 'text',
          pageIndex: 0,
          color: '#1b1a17',
          fontSize: 12,
          quad: {
            p0: { x: 100, y: 250 },
            p1: { x: 340, y: 250 },
            p2: { x: 340, y: 300 },
            p3: { x: 100, y: 300 },
          },
          text: 'Café déjà vu — Привет',
          createdAt: 3,
          updatedAt: 3,
        },
      ]);
      const pdf = await PDFDocument.load(exported);
      const acroForm = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
      const dr = acroForm.lookup(PDFName.of('DR'), PDFDict);
      const fonts = dr.lookup(PDFName.of('Font'), PDFDict);
      const noteFontRef = fonts.get(PDFName.of('FolioNote'));
      const noteFont = pdf.context.lookup(noteFontRef as never) as unknown as PDFDict;
      expect(noteFont.get(PDFName.of('Subtype'))?.toString()).toBe('/Type0');
      expect(noteFont.get(PDFName.of('ToUnicode'))).toBeDefined();
      const annot = pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).get(0);
      const annotation = pdf.context.lookup(annot as never) as unknown as PDFDict;
      const contents = annotation.get(PDFName.of('Contents'));
      expect(contents?.toString()).toContain('0043');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('is deterministic across repeated exports from the same source state', async () => {
    const first = await exportAnnotatedPdf(original, annotations);
    const second = await exportAnnotatedPdf(original, annotations);
    const firstAnnots = await annotsOf(first);
    const secondAnnots = await annotsOf(second);
    expect(firstAnnots.refs).toHaveLength(4);
    expect(secondAnnots.refs).toHaveLength(4);
    const firstNames = firstAnnots.refs.map((ref) =>
      firstAnnots.pdf.context.lookup(ref, PDFDict).get(PDFName.of('NM'))?.toString(),
    );
    const secondNames = secondAnnots.refs.map((ref) =>
      secondAnnots.pdf.context.lookup(ref, PDFDict).get(PDFName.of('NM'))?.toString(),
    );
    expect(firstNames).toEqual(secondNames);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('explains why an encrypted PDF cannot be written', async () => {
    const encrypted = fs.readFileSync('tests/fixtures/encrypted.pdf');
    const bytes = encrypted.buffer.slice(
      encrypted.byteOffset,
      encrypted.byteOffset + encrypted.byteLength,
    ) as ArrayBuffer;
    await expect(exportAnnotatedPdf(bytes, annotations)).rejects.toMatchObject<Partial<ExportError>>({
      code: 'encrypted',
    });
  });

  it('preserves an existing form when adding annotations', async () => {
    const formBytes = fs.readFileSync('tests/fixtures/signature-form.pdf');
    const bytes = formBytes.buffer.slice(
      formBytes.byteOffset,
      formBytes.byteOffset + formBytes.byteLength,
    ) as ArrayBuffer;
    const exported = await exportAnnotatedPdf(bytes, [
      {
        id: 'stamp-on-form',
        kind: 'signature',
        pageIndex: 0,
        dataUrl: signature,
        quad: {
          p0: { x: 60, y: 475 },
          p1: { x: 340, y: 475 },
          p2: { x: 340, y: 503 },
          p3: { x: 60, y: 503 },
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const pdf = await PDFDocument.load(exported);
    expect(pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict)).toBeDefined();
    expect((await annotsOf(exported)).refs).toHaveLength(2);
  });
});
