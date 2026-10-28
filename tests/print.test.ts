import { describe, expect, it } from 'vitest';
import { parsePageRange } from '../src/pdf/print';

describe('print page ranges', () => {
  it('parses single pages, ranges, and comma-separated lists', () => {
    expect(parsePageRange('2-5, 9', 10)).toEqual([1, 2, 3, 4, 8]);
    expect(parsePageRange('1,1,2', 4)).toEqual([0, 1]);
    expect(parsePageRange(' 3 ', 4)).toEqual([2]);
  });

  it('drops invalid or out-of-bounds entries', () => {
    expect(parsePageRange('0, 4, 9', 4)).toEqual([3]);
    expect(parsePageRange('5-2', 10)).toEqual([]);
    expect(parsePageRange('', 10)).toEqual([]);
    expect(parsePageRange('abc', 10)).toEqual([]);
  });
});
