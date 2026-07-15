import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runMaterialCleanupBatch, startMaterialCleanupWorker, type MaterialCleanupWorkerRepository } from './material-cleanup-worker';

test('worker consumes a claimed cleanup job and completes it', async () => {
  const events: string[] = [];
  const repository: MaterialCleanupWorkerRepository = {
    claim: async () => [{ id: 'job-1', fileKey: 'file-1', attempts: 0, leaseToken: 'token-a' }],
    complete: async (id) => { events.push(`complete:${id}`); return true; },
    retry: async () => { throw new Error('unexpected retry'); },
  };
  await runMaterialCleanupBatch(repository, async (key) => { events.push(`delete:${key}`); });
  assert.deepEqual(events, ['delete:file-1', 'complete:job-1']);
});

test('worker retries with bounded exponential backoff after storage failure', async () => {
  let delay = 0;
  const repository: MaterialCleanupWorkerRepository = {
    claim: async () => [{ id: 'job-1', fileKey: 'file-1', attempts: 3, leaseToken: 'token-a' }],
    complete: async () => true,
    retry: async (_id, _token, _error, delayMs) => { delay = delayMs; return true; },
  };
  await runMaterialCleanupBatch(repository, async () => { throw new Error('down'); });
  assert.equal(delay, 8 * 60_000);
});

test('periodic worker never overlaps a still-running batch', async () => {
  let active = 0;
  let maximum = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const repository: MaterialCleanupWorkerRepository = {
    claim: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gate;
      active -= 1;
      return [];
    },
    complete: async () => true,
    retry: async () => true,
  };
  const stop = startMaterialCleanupWorker({ intervalMs: 2, repository, removeFile: async () => undefined });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(maximum, 1);
  release();
  await stop();
});

test('database worker uses recoverable SKIP LOCKED leases and production server wiring', () => {
  const worker = readFileSync('src/lib/server/material-cleanup-worker.ts', 'utf8');
  const server = readFileSync('src/server.ts', 'utf8');
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /status='processing' AND lease_until < NOW\(\)/);
  assert.match(server, /!dev \? startMaterialCleanupWorker\(\)/);
  assert.match(server, /stopCleanupWorker\(\)\.finally/);
});

test('expired lease takeover makes stale owner complete and retry CAS no-ops', async () => {
  let owner = 'token-b';
  let status = 'processing';
  let attempts = 0;
  const repository: MaterialCleanupWorkerRepository = {
    claim: async () => [],
    complete: async (_id, token) => {
      if (status !== 'processing' || owner !== token) return false;
      status = 'completed'; owner = '';
      return true;
    },
    retry: async (_id, token) => {
      if (status !== 'processing' || owner !== token) return false;
      status = 'pending'; owner = ''; attempts += 1;
      return true;
    },
  };
  assert.equal(await repository.complete('job-1', 'token-a'), false);
  assert.equal(await repository.retry('job-1', 'token-a', 'late failure', 1000), false);
  assert.equal(status, 'processing');
  assert.equal(attempts, 0);
  assert.equal(await repository.complete('job-1', 'token-b'), true);
  assert.equal(status, 'completed');
  const worker = readFileSync('src/lib/server/material-cleanup-worker.ts', 'utf8');
  assert.match(worker, /lease_token=gen_random_uuid\(\)/);
  assert.match(worker, /status='processing' AND lease_token=\$2::uuid/g);
});
