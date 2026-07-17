import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  mapErrorStatus,
  ok,
  readIdempotentEnvelope,
  resolveMatrixMeta,
  writeIdempotentEnvelope,
} from './matrix-api';

test('matrix API envelope preserves trace/request ids and maps domain conflicts', async () => {
  const request = new NextRequest('http://localhost/api/v1/tasks/task-1/matrices', {
    headers: {
      'x-trace-id': 'trace-fixed',
      'x-request-id': 'request-fixed',
    },
  });
  const meta = resolveMatrixMeta(request);

  assert.deepEqual(meta, { traceId: 'trace-fixed', requestId: 'request-fixed' });
  assert.equal(mapErrorStatus('DESIGN_002'), 409);
  assert.equal(mapErrorStatus('DESIGN_404'), 404);

  const response = ok(meta, { id: 'matrix-1' }, 201);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    trace_id: 'trace-fixed',
    request_id: 'request-fixed',
    data: { id: 'matrix-1' },
    error: null,
  });
});

test('matrix API idempotency replays the saved response for the same key', async () => {
  const request = new NextRequest('http://localhost/api/v1/tasks/task-1/matrices', {
    headers: { 'idempotency-key': `matrix-api-test-${Date.now()}` },
  });
  const first = readIdempotentEnvelope(request);
  assert.equal(first.response, null);
  assert.ok(first.key);

  writeIdempotentEnvelope(first.key, 201, { data: { id: 'matrix-1' }, error: null });
  const replay = readIdempotentEnvelope(request);
  assert.ok(replay.response);
  assert.equal(replay.response.status, 201);
  assert.deepEqual(await replay.response.json(), { data: { id: 'matrix-1' }, error: null });
});
