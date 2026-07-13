import assert from 'node:assert/strict';
import { resolveGalleryMediaUrl } from '@/components/app/media-gallery';
import { pendingMediaDataUrl } from './use-presigned-url';

const material = (fileUrl: string, filePath?: string) => ({
  id: fileUrl,
  file_url: fileUrl,
  file_path: filePath,
  file_name: 'media',
  material_type: 'image',
});

for (const rawKey of ['garage/private/raw.jpg', 'experience-media/reports/raw.jpg']) {
  assert.equal(resolveGalleryMediaUrl(material(rawKey)), pendingMediaDataUrl);
  assert.equal(resolveGalleryMediaUrl(material(rawKey), `/uploads/${rawKey}`), pendingMediaDataUrl);
}

assert.equal(resolveGalleryMediaUrl(material('/uploads/local.jpg')), '/uploads/local.jpg');
assert.equal(resolveGalleryMediaUrl(material('https://cdn.example.com/signed.jpg')), 'https://cdn.example.com/signed.jpg');
assert.equal(resolveGalleryMediaUrl(material('data:image/gif;base64,AAAA')), 'data:image/gif;base64,AAAA');
assert.equal(resolveGalleryMediaUrl(material('blob:https://example.com/id')), 'blob:https://example.com/id');
assert.equal(
  resolveGalleryMediaUrl(material('garage/private/raw.jpg'), 'https://garage.example.com/signed.jpg?token=ok'),
  'https://garage.example.com/signed.jpg?token=ok',
);

console.log('media gallery URL resolution tests passed');
