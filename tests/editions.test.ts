import { describe, expect, it } from 'vitest';
import { resolveEdition } from '../electron/edition';
import { parseUpdateFeed } from '../electron/update-config';

describe('edition detection', () => {
  it('distinguishes development, portable, and installed builds', () => {
    expect(resolveEdition({ isPackaged: false, portable: false })).toBe('development');
    expect(resolveEdition({ isPackaged: true, portable: true })).toBe('portable');
    expect(resolveEdition({ isPackaged: true, portable: false })).toBe('installed');
  });
});

describe('update feed configuration', () => {
  it('accepts https feeds and local http development feeds', () => {
    expect(parseUpdateFeed('https://updates.example.com/folio/')?.hostname).toBe('updates.example.com');
    expect(parseUpdateFeed('http://localhost:8080/folio/')?.hostname).toBe('localhost');
    expect(parseUpdateFeed('http://127.0.0.1:9000/')?.hostname).toBe('127.0.0.1');
  });

  it('rejects absent, insecure remote, malformed, and credential-bearing feeds', () => {
    expect(parseUpdateFeed(undefined)).toBeNull();
    expect(parseUpdateFeed('')).toBeNull();
    expect(parseUpdateFeed('http://updates.example.com/')).toBeNull();
    expect(parseUpdateFeed('not a url')).toBeNull();
    expect(parseUpdateFeed('https://user:pass@updates.example.com/')).toBeNull();
  });
});
