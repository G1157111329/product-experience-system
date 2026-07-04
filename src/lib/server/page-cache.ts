import type { OutgoingHttpHeader, OutgoingHttpHeaders, ServerResponse } from 'node:http';

const NO_STORE_PAGE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, no-transform',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

const NON_PAGE_PREFIXES = [
  '/api/',
  '/_next/',
  '/uploads/',
];

export function getNoStorePageHeaders() {
  return { ...NO_STORE_PAGE_HEADERS };
}

export function isHtmlPageRequest(method: string | undefined, pathname: string, acceptHeader: string | undefined) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (NON_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;

  const lastSegment = pathname.split('/').pop() || '';
  if (lastSegment.includes('.')) return false;

  const accept = acceptHeader?.toLowerCase() || '';
  return !accept || accept.includes('*/*') || accept.includes('text/html');
}

type WriteHeadHeaders = OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined;

function withNoStoreHeaders(headers: WriteHeadHeaders): OutgoingHttpHeaders {
  const headerObject: OutgoingHttpHeaders | undefined = Array.isArray(headers)
    ? Object.fromEntries((headers as unknown[]).reduce<Array<[string, OutgoingHttpHeader]>>((pairs, item, index, array) => {
        if (index % 2 === 0 && typeof item === 'string') {
          pairs.push([item, array[index + 1] as OutgoingHttpHeader]);
        }
        return pairs;
      }, []))
    : headers;

  return {
    ...(headerObject || {}),
    ...NO_STORE_PAGE_HEADERS,
  };
}

export function applyNoStorePageHeaders(res: ServerResponse) {
  for (const [name, value] of Object.entries(NO_STORE_PAGE_HEADERS)) {
    res.setHeader(name, value);
  }

  const originalSetHeader = res.setHeader;
  res.setHeader = function setHeader(name: string, value: number | string | readonly string[]) {
    const headerName = name.toLowerCase();
    if (headerName === 'cache-control') {
      return originalSetHeader.call(this, name, NO_STORE_PAGE_HEADERS['Cache-Control']);
    }
    if (headerName === 'pragma') {
      return originalSetHeader.call(this, name, NO_STORE_PAGE_HEADERS.Pragma);
    }
    if (headerName === 'expires') {
      return originalSetHeader.call(this, name, NO_STORE_PAGE_HEADERS.Expires);
    }
    return originalSetHeader.call(this, name, value);
  };

  const originalWriteHead = res.writeHead;
  res.writeHead = (function writeHead(
    this: ServerResponse,
    statusCode: number,
    statusMessageOrHeaders?: string | WriteHeadHeaders,
    headers?: WriteHeadHeaders,
  ) {
    if (typeof statusMessageOrHeaders === 'string') {
      return (originalWriteHead as (...args: unknown[]) => ServerResponse)
        .call(this, statusCode, statusMessageOrHeaders, withNoStoreHeaders(headers));
    }
    return (originalWriteHead as (...args: unknown[]) => ServerResponse)
      .call(this, statusCode, withNoStoreHeaders(statusMessageOrHeaders));
  }) as ServerResponse['writeHead'];
}
