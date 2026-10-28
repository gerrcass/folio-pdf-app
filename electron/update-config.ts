export function parseUpdateFeed(candidate: string | null | undefined): URL | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate.trim());
    if (url.username || url.password) return null;
    if (url.protocol === 'https:') return url;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url;
  } catch {
    return null;
  }
  return null;
}
