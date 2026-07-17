const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm)(?:$|\?)/i;
const FILE_PREFIX = '/api/materials/file/';

/**
 * Converts a signed media-file URL into the opaque, single-stream video URL.
 * The query remains unchanged because the file endpoint validates that token
 * after the opaque route resolves the original storage key.
 */
export function toOpaqueVideoTransportUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value, 'https://media.local');
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith(FILE_PREFIX)) return null;

  const storageKey = parsed.pathname.slice(FILE_PREFIX.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
  if (!storageKey || !VIDEO_EXTENSION.test(storageKey)) return null;

  const opaqueKey = Buffer.from(storageKey, 'utf8').toString('base64url');
  const pathname = `/api/materials/video/${opaqueKey}`;
  const isAbsolute = /^https?:\/\//i.test(value);
  return `${isAbsolute ? parsed.origin : ''}${pathname}${parsed.search}`;
}
