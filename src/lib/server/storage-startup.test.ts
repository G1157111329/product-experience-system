import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLocalUploadDirectoryWritable } from './storage';

test('local upload startup probe accepts a writable directory and removes its probe file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'upload-probe-'));
  try {
    await validateLocalUploadDirectoryWritable(join(root, 'uploads'));
    assert.deepEqual(await readdir(join(root, 'uploads')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local upload startup probe rejects a path that cannot be a directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'upload-probe-'));
  const filePath = join(root, 'not-a-directory');
  try {
    await writeFile(filePath, 'occupied');
    await assert.rejects(
      validateLocalUploadDirectoryWritable(filePath),
      /LOCAL_UPLOAD_DIR is not writable/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
