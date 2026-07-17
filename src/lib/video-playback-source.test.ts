import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { resolveGalleryPreviewUrl, resolveGalleryVideoSrc } from '@/components/app/media-gallery';
import { toPlayableVideoSrc } from './use-presigned-url';

const origin = 'http://118.25.178.78:5000';
const localVideoUrl = '/uploads/materials/task-a/phone.mp4';
const opaqueVideoUrl = '/api/materials/video/bWF0ZXJpYWxzL3Rhc2stYS9waG9uZS5tcDQ';

test('routes local upload videos through the direct same-origin static path', () => {
  assert.equal(
    toPlayableVideoSrc('/uploads/materials/task-a/phone.mp4', origin),
    localVideoUrl,
  );
  assert.equal(
    toPlayableVideoSrc(`${origin}/uploads/materials/task-a/phone.mp4`, origin),
    localVideoUrl,
  );
  assert.equal(toPlayableVideoSrc('materials/task-a/phone.mp4', origin), localVideoUrl);
});

test('keeps a valid protected token for video playback', () => {
  assert.equal(
    toPlayableVideoSrc('/api/materials/file/materials/task-a/phone.mp4?exp=123&token=signed', origin),
    '/api/materials/file/materials/task-a/phone.mp4?exp=123&token=signed',
  );
});

test('keeps a signed opaque video stream URL for enterprise-network playback', () => {
  assert.equal(
    toPlayableVideoSrc(`${opaqueVideoUrl}?exp=123&token=signed`, origin),
    `${opaqueVideoUrl}?exp=123&token=signed`,
  );
});

test('rejects an enterprise private-network block-page redirect as a video source', () => {
  assert.equal(
    toPlayableVideoSrc('http://172.19.3.12/disable/disable.htm', origin),
    undefined,
  );
});

test('media gallery uses the direct same-origin playback source', () => {
  assert.equal(
    resolveGalleryVideoSrc('/uploads/materials/task-a/phone.mp4', origin),
    localVideoUrl,
  );
});

test('media gallery preview resolves a local video through uploads', () => {
  assert.equal(
    resolveGalleryPreviewUrl({
      id: 'video-1',
      file_url: '/uploads/materials/task-a/phone.mp4',
      file_name: 'phone.mp4',
      material_type: 'video',
    }, '/uploads/materials/task-a/phone.mp4', origin),
    localVideoUrl,
  );
});

test('media gallery preview supports a bare local file path', () => {
  assert.equal(
    resolveGalleryPreviewUrl({
      id: 'video-2',
      file_path: 'materials/task-a/phone.mp4',
      file_url: '/uploads/materials/task-a/phone.mp4',
      file_name: 'phone.mp4',
      material_type: 'video',
    }, '/uploads/materials/task-a/phone.mp4', origin),
    localVideoUrl,
  );
});

test('task, recipe, and report video elements never receive raw resolved upload URLs', () => {
  const files = [
    'src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx',
    'src/app/(main)/standards/components/recipe-library-section.tsx',
    'src/components/reports/report-media-preview.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    assert.match(source, /toPlayableVideoSrc\(/, file);
    assert.doesNotMatch(source, /<video\s+src=\{resolvedUrl\}/, file);
  }
});
