/**
 * Deterministic display filenames for AI-assisted material organisation.
 * The filename is metadata only: storage keys remain immutable so existing
 * report and matrix bindings never break when a material is renamed.
 */
export function buildContextMaterialFileName(input: {
  baseName: string;
  extension: string;
  sequence: number;
}) {
  const baseName = input.baseName
    .replace(/[\\/:"|?\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || '素材';
  const extension = input.extension.replace(/^\.+/, '').trim().toLowerCase() || 'jpg';
  const sequence = Math.max(1, Math.floor(Number(input.sequence) || 1));
  return `${baseName}${sequence}.${extension}`;
}

export function materialFileExtension(fileName: string | null | undefined, fallback: 'image' | 'video') {
  const matched = fileName?.match(/\.([a-z0-9]{1,10})(?:$|[?#])/i)?.[1]?.toLowerCase();
  return matched || (fallback === 'video' ? 'mp4' : 'jpg');
}
