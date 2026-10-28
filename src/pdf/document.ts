import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { yieldToMain } from '../lib/async';
import { normalizeRotation } from './geometry';

GlobalWorkerOptions.workerSrc = workerUrl;

export type PasswordReason = 'required' | 'incorrect';

export type PdfOpenErrorCode = 'invalid' | 'password' | 'cancelled' | 'unsupported';

export class PdfOpenError extends Error {
  readonly code: PdfOpenErrorCode;

  constructor(code: PdfOpenErrorCode, message: string) {
    super(message);
    this.name = 'PdfOpenError';
    this.code = code;
  }
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pdfVersion?: string;
}

export interface PageMetrics {
  pageIndex: number;
  baseWidth: number;
  baseHeight: number;
  pageRotation: number;
}

export interface PdfLoadProgress {
  loaded: number;
  total: number;
}

export interface PdfLoadOptions {
  onPassword?: (reason: PasswordReason) => Promise<string | null>;
  onProgress?: (progress: PdfLoadProgress) => void;
  isCancelled?: () => boolean;
  signal?: AbortSignal;
}

export interface DigitalSignatureInfo {
  id: string;
  fieldName: string;
  signerName: string | null;
  signingTime: string | null;
  coversWholeDocument?: boolean;
  modificationsAfterSignature?: number;
}

function assetUrl(relative: string): string {
  return new URL(relative, document.baseURI).href;
}

function toError(error: unknown, cancelled: boolean): PdfOpenError {
  if (cancelled) return new PdfOpenError('cancelled', 'Password entry was cancelled.');
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return new PdfOpenError('password', 'This PDF needs a password that was not accepted.');
  }
  if (name === 'InvalidPDFException') {
    return new PdfOpenError('invalid', 'This file is not a readable PDF.');
  }
  if (name === 'MissingPDFException') {
    return new PdfOpenError('invalid', 'The PDF could not be found or read.');
  }
  const message = error instanceof Error ? error.message : 'The PDF could not be opened.';
  return new PdfOpenError('unsupported', message);
}

export class PdfDocumentSession {
  readonly pdf: PDFDocumentProxy;
  readonly bytes: ArrayBuffer;
  readonly fingerprint: string;
  readonly name: string;
  readonly pageCount: number;
  readonly title: string;
  readonly metadata: PdfMetadata;
  readonly isProtected: boolean;
  readonly pages: PDFPageProxy[] = [];
  private signaturesPromise: Promise<DigitalSignatureInfo[]> | null = null;
  private destroyed = false;
  private textContentCache = new Map<number, ReturnType<PDFPageProxy['getTextContent']>>();

  private constructor(
    pdf: PDFDocumentProxy,
    bytes: ArrayBuffer,
    fingerprint: string,
    name: string,
    metadata: PdfMetadata,
    isProtected: boolean,
  ) {
    this.pdf = pdf;
    this.bytes = bytes;
    this.fingerprint = fingerprint;
    this.name = name;
    this.pageCount = pdf.numPages;
    this.metadata = metadata;
    this.title = metadata.title?.trim() || name.replace(/\.pdf$/i, '');
    this.isProtected = isProtected;
  }

  static async load(
    bytes: ArrayBuffer,
    name: string,
    fingerprint: string,
    options: PdfLoadOptions = {},
  ): Promise<PdfDocumentSession> {
    let cancelled = false;
    let protectedDocument = false;
    const loadingTask = getDocument({
      data: new Uint8Array(bytes.slice(0)),
      cMapUrl: assetUrl('pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: assetUrl('pdfjs/standard_fonts/'),
      wasmUrl: assetUrl('pdfjs/wasm/'),
      useSystemFonts: true,
      enableXfa: true,
    });

    loadingTask.onProgress = (progress: PdfLoadProgress) => {
      options.onProgress?.({ loaded: progress.loaded, total: progress.total });
    };

    const onAbort = () => {
      cancelled = true;
      void loadingTask.destroy();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      protectedDocument = true;
      if (!options.onPassword) {
        cancelled = true;
        void loadingTask.destroy();
        return;
      }
      const passwordReason: PasswordReason =
        reason === PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'required';
      void options
        .onPassword(passwordReason)
        .then((password) => {
          if (password === null) {
            cancelled = true;
            void loadingTask.destroy();
            return;
          }
          updatePassword(password);
        })
        .catch(() => {
          cancelled = true;
          void loadingTask.destroy();
        });
    };

    try {
      const pdf = await loadingTask.promise;
      if (options.isCancelled?.()) {
        await pdf.loadingTask.destroy();
        throw new PdfOpenError('cancelled', 'The open was cancelled.');
      }
      const metadataResult = await pdf.getMetadata().catch(() => null);
      const info = (metadataResult?.info ?? {}) as Record<string, unknown>;
      const metadata: PdfMetadata = {
        title: typeof info.Title === 'string' ? info.Title : undefined,
        author: typeof info.Author === 'string' ? info.Author : undefined,
        subject: typeof info.Subject === 'string' ? info.Subject : undefined,
        keywords: typeof info.Keywords === 'string' ? info.Keywords : undefined,
        creator: typeof info.Creator === 'string' ? info.Creator : undefined,
        producer: typeof info.Producer === 'string' ? info.Producer : undefined,
        creationDate: typeof info.CreationDate === 'string' ? info.CreationDate : undefined,
        modificationDate: typeof info.ModDate === 'string' ? info.ModDate : undefined,
        pdfVersion: typeof info.PDFFormatVersion === 'string' ? info.PDFFormatVersion : undefined,
      };
      return new PdfDocumentSession(pdf, bytes, fingerprint, name, metadata, protectedDocument);
    } catch (error) {
      if (error instanceof PdfOpenError) throw error;
      throw toError(error, cancelled);
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  async preparePages(
    onProgress?: (loaded: number, total: number) => void,
    isCancelled?: () => boolean,
  ): Promise<PageMetrics[]> {
    const metrics: PageMetrics[] = new Array(this.pageCount);
    const chunkSize = 8;
    for (let start = 0; start < this.pageCount; start += chunkSize) {
      if (isCancelled?.() || this.destroyed) throw new PdfOpenError('cancelled', 'The open was cancelled.');
      const end = Math.min(start + chunkSize, this.pageCount);
      const pages = await Promise.all(
        Array.from({ length: end - start }, (_, offset) => this.getPage(start + offset)),
      );
      pages.forEach((page, offset) => {
        const pageIndex = start + offset;
        const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
        this.pages[pageIndex] = page;
        metrics[pageIndex] = {
          pageIndex,
          baseWidth: viewport.width,
          baseHeight: viewport.height,
          pageRotation: normalizeRotation(page.rotate),
        };
      });
      onProgress?.(end, this.pageCount);
      await yieldToMain();
    }
    return metrics;
  }

  async getPage(pageIndex: number): Promise<PDFPageProxy> {
    const cached = this.pages[pageIndex];
    if (cached) return cached;
    const page = await this.pdf.getPage(pageIndex + 1);
    this.pages[pageIndex] = page;
    return page;
  }

  getViewport(pageIndex: number, scale: number, viewerRotation: number): PageViewport {
    const page = this.pages[pageIndex];
    if (!page) throw new Error(`Page ${pageIndex + 1} has not been prepared.`);
    return page.getViewport({
      scale,
      rotation: normalizeRotation(page.rotate + viewerRotation),
    });
  }

  getTextContent(pageIndex: number): ReturnType<PDFPageProxy['getTextContent']> {
    const cached = this.textContentCache.get(pageIndex);
    if (cached) return cached;
    const promise = this.getPage(pageIndex).then((page) => page.getTextContent());
    this.textContentCache.set(pageIndex, promise);
    return promise;
  }

  async getDigitalSignatures(): Promise<DigitalSignatureInfo[]> {
    if (!this.signaturesPromise) {
      this.signaturesPromise = this.pdf
        .getSignatures()
        .then((signatures) =>
          (signatures ?? []).map((signature) => {
            const raw = signature as Record<string, unknown>;
            return {
              id: String(raw.id ?? ''),
              fieldName: String(raw.fieldName ?? ''),
              signerName: typeof raw.signerName === 'string' ? raw.signerName : null,
              signingTime: typeof raw.signingTime === 'string' ? raw.signingTime : null,
              coversWholeDocument:
                typeof raw.coversWholeDocument === 'boolean' ? raw.coversWholeDocument : undefined,
              modificationsAfterSignature:
                typeof raw.modificationsAfterSignature === 'number'
                  ? raw.modificationsAfterSignature
                  : undefined,
            } satisfies DigitalSignatureInfo;
          }),
        )
        .catch(() => []);
    }
    return this.signaturesPromise;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pages.length = 0;
    this.textContentCache.clear();
    await this.pdf.loadingTask.destroy();
  }
}
