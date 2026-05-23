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
