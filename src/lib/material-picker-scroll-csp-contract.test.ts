import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imagePreview = readFileSync('src/components/image-preview.tsx', 'utf8');
const materialPicker = readFileSync('src/components/material-picker.tsx', 'utf8');
const nextConfig = readFileSync('next.config.mjs', 'utf8');
const presignedMedia = readFileSync('src/components/presigned-media.tsx', 'utf8');

assert.match(nextConfig, /media-src 'self' data: blob: https: http:/);
assert.match(nextConfig, /img-src 'self' data: blob: https: http:/);
assert.match(nextConfig, /connect-src 'self' https: http:/);

assert.match(imagePreview, /toPlayableVideoSrc/);
assert.match(presignedMedia, /toPlayableVideoSrc/);
const usePresigned = readFileSync('src/lib/use-presigned-url.ts', 'utf8');
assert.match(usePresigned, /export function toPlayableVideoSrc/);
assert.match(usePresigned, /isUnavailableMediaUrl\(value\) \|\| value\.startsWith\('data:'\)/);

assert.doesNotMatch(materialPicker, /from '@\/components\/ui\/scroll-area'/);
assert.match(materialPicker, /data-testid="material-picker-scroll"/);
assert.match(materialPicker, /overflow-y-auto/);
assert.match(materialPicker, /flex max-h-\[85vh\] max-w-lg flex-col overflow-hidden/);
assert.match(materialPicker, /material_type === 'video'\) return ''/);

console.log('material picker scroll + video CSP contract tests passed');
