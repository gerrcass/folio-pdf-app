import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'tests', 'fixtures');
await fs.mkdir(fixtures, { recursive: true });

const ink = rgb(0.11, 0.1, 0.08);
const muted = rgb(0.36, 0.33, 0.28);
const accent = rgb(0.71, 0.33, 0.19);
const paper = rgb(0.97, 0.95, 0.91);

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
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

async function makeSample() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('The Quiet Interface');
  pdf.setAuthor('Folio Field Notes');
  pdf.setSubject('A short essay about attention and tools');
  pdf.setCreator('Folio fixture generator');

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const cover = pdf.addPage([612, 792]);
  cover.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
  cover.drawRectangle({ x: 54, y: 572, width: 66, height: 4, color: accent });
  cover.drawText('FOLIO FIELD NOTES', { x: 54, y: 720, size: 9, font: sansBold, color: muted, characterSpacing: 1.8 });
  cover.drawText('The Quiet', { x: 54, y: 500, size: 64, font: serif, color: ink });
  cover.drawText('Interface', { x: 54, y: 430, size: 64, font: serifItalic, color: ink });
  cover.drawText('On attention, margins, and tools that step back.', {
    x: 54,
    y: 360,
    size: 14,
    font: serifItalic,
    color: muted,
    maxWidth: 420,
  });
  cover.drawRectangle({ x: 54, y: 180, width: 504, height: 1, color: rgb(0.82, 0.78, 0.7) });
  cover.drawText('A reader should feel like a room, not a control panel.', {
    x: 54,
    y: 148,
    size: 10,
    font: sans,
    color: muted,
  });
  cover.drawText('2026', { x: 520, y: 148, size: 10, font: sans, color: muted });

  const paragraphs = [
    'A good reading tool is mostly absence. It gives a document a generous surface, keeps the controls within reach, and then stops asking for attention. The margin is not empty space. It is room for the eye to rest.',
    'We built Folio around a small set of promises: the page should arrive quickly, the interface should not compete with the text, and a note should land exactly where it was drawn. Everything else is in service of those promises.',
    'The luminous margin is where reading becomes thinking. A highlight is a decision to return. A note is a thought held in place. A signature is a deliberate act, never an automatic one.',
    'Large documents test the honesty of a reader. A three-hundred-page report cannot be rendered all at once; search cannot block the page; annotations cannot drift under rotation. These are not edge cases. They are the work.',
    'Local-first is a posture, not a feature list. The document stays where it is. The library is a convenience, not a copy in someone else\'s account. When the network disappears, the reading room remains.',
    'Night reading should quiet the page without turning the whole interface into a cave. The page is treated; the controls remain recognizable. The two preferences are allowed to disagree.',
    'Search results arrive from the text layer in the background. Type while the index is still filling. The count settles when the document is ready, and the current match never jumps to a different page behind your back.',
    'A visual signature is a picture, not a certificate. Folio says so plainly, asks for approval, and embeds the image as a transparent stamp. The product should never borrow trust it has not earned.',
  ];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
    page.drawText(String(index + 2).padStart(2, '0'), {
      x: 54,
      y: 735,
      size: 9,
      font: sans,
      color: muted,
      characterSpacing: 1,
    });
    page.drawText('THE QUIET INTERFACE', {
      x: 390,
      y: 735,
      size: 7.5,
      font: sans,
      color: muted,
      characterSpacing: 1.2,
    });
    const lines = wrap(paragraphs[index], serif, 14, 480);
    let y = 660;
    if (index === 0) {
      page.drawText('One', { x: 54, y: 680, size: 34, font: serifItalic, color: accent });
      y = 620;
    }
    for (const line of lines) {
      page.drawText(line, { x: 54, y, size: 14, font: serif, color: ink, lineHeight: 22 });
      y -= 22;
    }
    page.drawRectangle({ x: 54, y: 96, width: 84, height: 2, color: accent });
    page.drawText('FOLIO · 2026', { x: 54, y: 74, size: 8, font: sans, color: muted, characterSpacing: 0.8 });
    page.drawText(`${index + 2}`, { x: 544, y: 74, size: 9, font: sans, color: muted });
  }

  // A page with plausible signature labels for field-suggestion testing.
  const form = pdf.addPage([612, 792]);
  form.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
  form.drawText('Acknowledgment', { x: 54, y: 700, size: 28, font: serif, color: ink });
  form.drawText('By signing below, the reader agrees to keep the margin luminous.', {
    x: 54,
    y: 660,
    size: 12,
    font: serif,
    color: muted,
  });
  form.drawText('Signature', { x: 54, y: 540, size: 10, font: sansBold, color: muted });
  form.drawRectangle({ x: 54, y: 500, width: 270, height: 36, borderColor: rgb(0.7, 0.66, 0.6), borderWidth: 0.8 });
  form.drawText('Date', { x: 360, y: 540, size: 10, font: sansBold, color: muted });
  form.drawRectangle({ x: 360, y: 500, width: 180, height: 36, borderColor: rgb(0.7, 0.66, 0.6), borderWidth: 0.8 });
  form.drawText('Sign here', { x: 54, y: 440, size: 11, font: serifItalic, color: accent });
  form.drawText('Folio will still ask you to approve placement before adding anything.', {
    x: 54,
    y: 410,
    size: 9,
    font: sans,
    color: muted,
  });

  await fs.writeFile(path.join(fixtures, 'sample.pdf'), await pdf.save());
}

async function makeRotated() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([500, 700]);
  page.setCropBox(40, 60, 420, 600);
  page.setRotation(degrees(90));
  page.drawRectangle({ x: 40, y: 60, width: 420, height: 600, color: rgb(0.98, 0.96, 0.92) });
  page.drawText('Rotated page with a nonzero CropBox origin.', {
    x: 70,
    y: 420,
    size: 18,
    font,
    color: rgb(0.1, 0.09, 0.08),
    maxWidth: 300,
  });
  page.drawText('If a highlight or signature drifts here, geometry is wrong.', {
    x: 70,
    y: 370,
    size: 12,
    font,
    color: rgb(0.4, 0.36, 0.3),
    maxWidth: 320,
  });
  page.drawText('Signature', { x: 70, y: 260, size: 10, font, color: rgb(0.3, 0.27, 0.23) });
  page.drawRectangle({ x: 70, y: 210, width: 250, height: 36, borderColor: rgb(0.6, 0.55, 0.48), borderWidth: 1 });
  const second = pdf.addPage([700, 500]);
  second.drawText('Landscape companion page', { x: 60, y: 400, size: 24, font, color: rgb(0.1, 0.09, 0.08) });
  await fs.writeFile(path.join(fixtures, 'rotated-cropbox.pdf'), await pdf.save());
}

async function makeSignatureForm() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
  page.drawText('Reader acknowledgment', { x: 54, y: 700, size: 28, font: bold, color: ink });
  page.drawText('Please sign below.', { x: 54, y: 660, size: 12, font, color: muted });
  page.drawText('Signature', { x: 54, y: 520, size: 10, font: bold, color: muted });
  page.drawText('Sign here', { x: 54, y: 440, size: 10, font, color: accent });
  page.drawRectangle({ x: 54, y: 470, width: 300, height: 34, borderColor: rgb(0.68, 0.63, 0.56), borderWidth: 0.8 });

  const context = pdf.context;
  const widget = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: 'ReaderSignature',
      Rect: [54, 470, 354, 504],
      F: 4,
      P: page.ref,
      MK: { BC: [0.68, 0.63, 0.56], BG: [1, 1, 1] },
    }),
  );
  page.node.addAnnot(widget);
  const acro = context.obj({
    Fields: [widget],
    SigFlags: 3,
    DA: '/Helv 0 Tf 0 g',
  });
  pdf.catalog.set(PDFName.of('AcroForm'), acro);

  await fs.writeFile(path.join(fixtures, 'signature-form.pdf'), await pdf.save());
}

async function makeLarge() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 300; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.98, 0.97, 0.94) });
    page.drawText(`Section ${Math.floor(index / 10) + 1} · Page ${index + 1}`, {
      x: 54,
      y: 720,
      size: 18,
      font,
      color: ink,
    });
    for (let line = 0; line < 18; line += 1) {
      page.drawText(
        `The luminous margin is a stable phrase on page ${index + 1}. Reading memory, search, and geometry should remain consistent across every line.`,
        { x: 54, y: 660 - line * 28, size: 10.5, font, color: muted, maxWidth: 500 },
      );
    }
  }
  await fs.writeFile(path.join(fixtures, 'large.pdf'), await pdf.save());
}

await makeSample();
await makeRotated();
await makeSignatureForm();
await makeLarge();

// Encryption is generated with pypdf, which remains a fixture-time dependency only.
try {
  const python = path.join(root, 'scripts', 'make-encrypted.py');
  const script = `
from pypdf import PdfReader, PdfWriter
reader = PdfReader(${JSON.stringify(path.join(fixtures, 'sample.pdf'))})
writer = PdfWriter()
writer.append(reader)
writer.encrypt('folio')
with open(${JSON.stringify(path.join(fixtures, 'encrypted.pdf'))}, 'wb') as handle:
    writer.write(handle)
`;
  await fs.writeFile(python, script);
  execFileSync('python3', [python], { stdio: 'inherit' });
  await fs.rm(python);
  console.log('[folio] generated encrypted fixture with password "folio"');
} catch (error) {
  console.warn('[folio] could not generate encrypted fixture (pypdf missing?)', error.message);
}

console.log('[folio] fixtures written to tests/fixtures');
