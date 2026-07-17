import assert from 'node:assert/strict';
import { jsonResponse } from './http-json-response';

async function main() {
  const response = jsonResponse({ code: 0, data: { name: '素材' } }, { status: 200 });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Content-Length'), String(Buffer.byteLength(body)));

  console.log('http json response tests passed');
}

void main();
