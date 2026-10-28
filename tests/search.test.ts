import { describe, expect, it } from 'vitest';
import type { PdfDocumentSession } from '../src/pdf/document';
import {
  groupMatchesByPage,
  makeSnippet,
  normalizePageText,
  SearchIndex,
} from '../src/pdf/search';

const pages = [
  'The luminous margin is where reading becomes thinking. A luminous margin rewards attention.',
  'A note is a thought held in place. The margin is not empty space.',
  'Nothing to find here except the word luminous.',
];

function fakeSession(): PdfDocumentSession {
  return {
    pageCount: pages.length,
    getPage: async () => {
      throw new Error('not needed');
    },
    getTextContent: async (pageIndex: number) => ({
      items: [{ str: pages[pageIndex] }],
    }),
  } as unknown as PdfDocumentSession;
}

describe('search', () => {
  it('normalizes PDF text without losing word boundaries', () => {
    expect(normalizePageText('  one\n\ntwo\tthree  ')).toBe('one two three');
  });

  it('builds context snippets that preserve the exact match', () => {
    const text = 'The luminous margin is where reading becomes thinking. A highlight is a decision to return.';
    const index = text.toLocaleLowerCase().indexOf('luminous margin');
    const snippet = makeSnippet(text, index, 'luminous margin'.length, 2);
    expect(snippet.match).toBe('luminous margin');
    expect(`${snippet.before}${snippet.match}${snippet.after}`).toContain('luminous margin');
    expect(snippet.before.startsWith('…')).toBe(true);
  });

  it('indexes pages incrementally and reports accurate counts', async () => {
    const progress: number[] = [];
    const index = new SearchIndex(fakeSession(), (value) => progress.push(value.indexedPages));
    await index.build();
    expect(progress.at(-1)).toBe(3);
    const results = index.search('luminous');
    expect(results.total).toBe(3);
    expect(results.indexedPages).toBe(3);
    expect(results.indexing).toBe(false);
    expect(results.matches.map((match) => match.pageIndex)).toEqual([0, 0, 2]);
    expect(results.matches[0].snippet.match).toBe('luminous');
    index.destroy();
  });

  it('searches case-insensitively by default and groups by page', async () => {
    const index = new SearchIndex(fakeSession());
    await index.build();
    const results = index.search('LUMINOUS');
    expect(results.total).toBe(3);
    const grouped = groupMatchesByPage(results.matches);
    expect([...grouped.keys()]).toEqual([0, 2]);
    expect(grouped.get(0)).toHaveLength(2);
    index.destroy();
  });

  it('returns no matches for an empty query', async () => {
    const index = new SearchIndex(fakeSession());
    await index.build();
    expect(index.search('').total).toBe(0);
    index.destroy();
  });
});
