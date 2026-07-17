import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('opaque video route delegates streaming to the existing local file route', async () => {
  const source = await readFile(
    new URL('../app/api/materials/video/[token]/route.ts', import.meta.url),
    'utf8',
  ).catch(() => '');

  assert.match(source, /GET as fileRouteGET/);
  assert.match(source, /Buffer\.from\(token, 'base64url'\)\.toString\('utf8'\)/);
  assert.match(source, /headers\.delete\('range'\)/);
  assert.match(source, /x-xp-video-single-stream/);
  assert.doesNotMatch(source, /S3|@aws-sdk/);
});
