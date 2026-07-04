import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import {
  applyNoStorePageHeaders,
  getNoStorePageHeaders,
  isHtmlPageRequest,
} from './page-cache';

assert.equal(isHtmlPageRequest('GET', '/login', 'text/html'), true);
assert.equal(isHtmlPageRequest('HEAD', '/reports', 'text/html,application/xhtml+xml'), true);
assert.equal(isHtmlPageRequest('HEAD', '/reports', '*/*'), true);
assert.equal(isHtmlPageRequest('GET', '/_next/static/chunks/app.js', 'text/html'), false);
assert.equal(isHtmlPageRequest('GET', '/api/reports', 'text/html'), false);
assert.equal(isHtmlPageRequest('POST', '/login', 'text/html'), false);

const headers = getNoStorePageHeaders();
assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate, proxy-revalidate, no-transform');
assert.equal(headers.Pragma, 'no-cache');
assert.equal(headers.Expires, '0');

const response = new ServerResponse(new IncomingMessage(new Socket()));
applyNoStorePageHeaders(response);
response.writeHead(200, {
  'Cache-Control': 's-maxage=31536000',
  Pragma: 'cache',
  Expires: 'tomorrow',
  'Content-Type': 'text/html; charset=utf-8',
});
assert.equal(response.getHeader('Cache-Control'), headers['Cache-Control']);
assert.equal(response.getHeader('Pragma'), headers.Pragma);
assert.equal(response.getHeader('Expires'), headers.Expires);
assert.equal(response.getHeader('Content-Type'), 'text/html; charset=utf-8');

console.log('page cache tests passed');
