export type PrintMode = 'fast' | 'high' | 'text';

export function normalizePrintMode(value: string | null | undefined): PrintMode {
  if (value === 'high' || value === 'text') return value;
  return 'fast';
}

export function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawUrl of urls) {
    const url = rawUrl.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

const posterPathPrefix = '/api/materials/poster/';

export function posterStorageKey(posterUrl: string) {
  const pathname = new URL(posterUrl, 'http://print.local').pathname;
  if (!pathname.startsWith(posterPathPrefix)) return '';
  return pathname.slice(posterPathPrefix.length).split('/').map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  }).join('/');
}

export function signedPosterUrl(posterUrl: string, signedMediaUrl: string) {
  const signedIsAbsolute = /^https?:\/\//i.test(signedMediaUrl);
  const signed = new URL(signedMediaUrl, 'http://print.local');
  const poster = new URL(posterUrl, 'http://print.local');
  poster.search = signed.search;
  return signedIsAbsolute ? `${signed.origin}${poster.pathname}${poster.search}` : `${poster.pathname}${poster.search}`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
