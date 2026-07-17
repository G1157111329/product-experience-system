import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

test('opaque local video stream suppresses Range and returns one progressive response', async () => {
  const storageKey = '.codex-test/video-stream/sample.mp4';
  const absolutePath = path.resolve(process.cwd(), 'public/uploads', storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from([0, 1, 2, 3, 4, 5]));

  try {
    const token = Buffer.from(storageKey, 'utf8').toString('base64url');
    const { GET } = await import('../app/api/materials/video/[token]/route');
    const request = new NextRequest(`http://localhost/api/materials/video/${token}`, {
      headers: { Range: 'bytes=1-3' },
    });
    const response = await GET(request, { params: Promise.resolve({ token }) });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('accept-ranges'), null);
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(response.headers.get('x-xp-video-transport'), 'single-stream');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 1, 2, 3, 4, 5]));
  } finally {
    await rm(path.resolve(process.cwd(), 'public/uploads/.codex-test'), { recursive: true, force: true });
  }
});
