import { yieldToMain } from '../lib/async';
import type { PdfDocumentSession } from './document';

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export interface SearchMatch {
  pageIndex: number;
  start: number;
  length: number;
  ordinalOnPage: number;
  snippet: Snippet;
}

export interface SearchResultSet {
  query: string;
  matches: SearchMatch[];
  total: number;
  indexedPages: number;
  totalPages: number;
  indexing: boolean;
}

export interface SearchProgress {
  indexedPages: number;
  totalPages: number;
  done: boolean;
}

export function normalizePageText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function makeSnippet(text: string, index: number, length: number, radius = 56): Snippet {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  let before = text.slice(start, index);
  let after = text.slice(index + length, end);
  if (start > 0) {
    const space = before.indexOf(' ');
    if (space >= 0 && space < before.length - 1) before = before.slice(space + 1);
    before = `…${before}`;
  }
  if (end < text.length) {
    const space = after.lastIndexOf(' ');
    if (space > 0) after = after.slice(0, space);
    after = `${after}…`;
  }
  return {
    before: before.trimStart(),
    match: text.slice(index, index + length),
    after: after.trimEnd(),
  };
}

export function groupMatchesByPage(matches: SearchMatch[]): Map<number, SearchMatch[]> {
  const grouped = new Map<number, SearchMatch[]>();
  for (const match of matches) {
    const existing = grouped.get(match.pageIndex);
    if (existing) existing.push(match);
    else grouped.set(match.pageIndex, [match]);
  }
  return grouped;
}

export class SearchIndex {
  private pages: string[] = [];
  private indexedPages = 0;
  private totalPages: number;
  private destroyed = false;
  private buildPromise: Promise<void> | null = null;

  constructor(
    private readonly session: PdfDocumentSession,
    private readonly onProgress?: (progress: SearchProgress) => void,
  ) {
    this.totalPages = session.pageCount;
  }

  get progress(): SearchProgress {
    return {
      indexedPages: this.indexedPages,
      totalPages: this.totalPages,
      done: this.indexedPages >= this.totalPages,
    };
  }

  get pageTexts(): readonly string[] {
    return this.pages;
  }

  build(): Promise<void> {
    if (this.buildPromise) return this.buildPromise;
    this.buildPromise = this.run();
    return this.buildPromise;
  }

  private async run(): Promise<void> {
    const chunkSize = 4;
    for (let start = 0; start < this.totalPages; start += chunkSize) {
      if (this.destroyed) return;
      const end = Math.min(start + chunkSize, this.totalPages);
      const texts = await Promise.all(
        Array.from({ length: end - start }, async (_, offset) => {
          const pageIndex = start + offset;
          try {
            const content = await this.session.getTextContent(pageIndex);
            const text = content.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            return normalizePageText(text);
          } catch {
            return '';
          }
        }),
      );
      texts.forEach((text, offset) => {
        this.pages[start + offset] = text;
      });
      this.indexedPages = end;
      this.onProgress?.(this.progress);
      if (this.indexedPages >= this.totalPages && !performance.getEntriesByName('folio:search:indexed').length) {
        performance.mark('folio:search:indexed');
        try {
          performance.measure('folio:index-duration', 'folio:open:start', 'folio:search:indexed');
        } catch {
          // The mark is diagnostic only.
        }
      }
      await yieldToMain();
    }
  }

  search(query: string, caseSensitive = false): SearchResultSet {
    const normalizedQuery = caseSensitive ? query : query.toLocaleLowerCase();
    const matches: SearchMatch[] = [];
    if (normalizedQuery.length > 0) {
      for (let pageIndex = 0; pageIndex < this.indexedPages; pageIndex += 1) {
        const text = this.pages[pageIndex] ?? '';
        const haystack = caseSensitive ? text : text.toLocaleLowerCase();
        let from = 0;
        let ordinalOnPage = 0;
        while (from <= haystack.length) {
          const index = haystack.indexOf(normalizedQuery, from);
          if (index < 0) break;
          matches.push({
            pageIndex,
            start: index,
            length: normalizedQuery.length,
            ordinalOnPage,
            snippet: makeSnippet(text, index, normalizedQuery.length),
          });
          ordinalOnPage += 1;
          from = index + Math.max(1, normalizedQuery.length);
        }
      }
    }
    return {
      query,
      matches,
      total: matches.length,
      indexedPages: this.indexedPages,
      totalPages: this.totalPages,
      indexing: this.indexedPages < this.totalPages,
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.pages = [];
  }
}
