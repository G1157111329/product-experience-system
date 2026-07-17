/**
 * Local media was historically persisted both as a bare object key and as a
 * `/uploads/<key>` public path. Keep both representations readable while
 * storage access migrates behind the signed file endpoint.
 */
export function localStoragePathVariants(value: string | null | undefined): string[] {
  const path = value?.trim() || '';
  if (!path || path === '/uploads/') return [];
  if (path.startsWith('/uploads/')) {
    const storageKey = path.slice('/uploads/'.length);
    return storageKey ? [path, storageKey] : [];
  }
  return [path, `/uploads/${path}`];
}
