export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  const body = JSON.stringify(payload);
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Content-Length', String(new TextEncoder().encode(body).byteLength));
  return new Response(body, { ...init, headers });
}
