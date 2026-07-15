import { readFile, stat } from 'fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { resolve, sep } from 'path';
import { parse } from 'url';
import next from 'next';
import { applyNoStorePageHeaders, isHtmlPageRequest } from './lib/server/page-cache';
import { validateProductionStartupSecurity } from './lib/server/startup-security';
import { startMaterialCleanupWorker } from './lib/server/material-cleanup-worker';
import {
  createLocalFileReadStream,
  getLocalContentType,
  isLocalUploadPublicAccess,
  isNginxAccelRedirect,
  LOCAL_PUBLIC_BASE_PATH,
  NEW_UPLOAD_DRIVER,
  NGINX_UPLOADS_INTERNAL,
  statLocalFile,
  STORAGE_DRIVER,
  validateLocalUploadDirectoryWritable,
} from './lib/server/storage';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function getStaticContentType(pathname: string) {
  if (pathname.endsWith('.js')) return 'application/javascript; charset=UTF-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=UTF-8';
  if (pathname.endsWith('.json')) return 'application/json; charset=UTF-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.woff')) return 'font/woff';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function enforceNoStoreForHtmlPage(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) return;

  const parsedUrl = parse(req.url);
  const pathname = parsedUrl.pathname || '';
  if (!isHtmlPageRequest(req.method, pathname, req.headers.accept)) return;
  applyNoStorePageHeaders(res);
}

async function tryServeNextStatic(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) return false;

  const parsedUrl = parse(req.url);
  const pathname = parsedUrl.pathname || '';
  if (!pathname.startsWith('/_next/static/')) return false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return true;
  }

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return true;
  }

  const staticRoot = resolve(process.cwd(), '.next/static');
  const relativePath = decodedPathname.slice('/_next/static/'.length);
  const filePath = resolve(staticRoot, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return true;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;

    res.statusCode = 200;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, no-transform');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', getStaticContentType(filePath));
    res.setHeader('Content-Length', fileStat.size);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    const body = await readFile(filePath);
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function tryServeLocalUpload(req: IncomingMessage, res: ServerResponse) {
  if (STORAGE_DRIVER === 's3' || !isLocalUploadPublicAccess() || !req.url) return false;

  const parsedUrl = parse(req.url);
  const pathname = parsedUrl.pathname || '';
  const publicBasePath = LOCAL_PUBLIC_BASE_PATH.replace(/\/+$/, '');
  if (pathname !== publicBasePath && !pathname.startsWith(`${publicBasePath}/`)) return false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return true;
  }

  const rawKey = pathname.slice(publicBasePath.length + 1);
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return true;
  }

  try {
    const fileStat = await statLocalFile(key);
    const contentType = getLocalContentType(key);

    if (isNginxAccelRedirect()) {
      const encodedKey = key.split('/').map(encodeURIComponent).join('/');
      const internalPath = `${NGINX_UPLOADS_INTERNAL}/${encodedKey}`;
      res.statusCode = 200;
      res.setHeader('X-Accel-Redirect', internalPath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end();
      return true;
    }

    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${fileStat.size}`);
        res.end();
        return true;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileStat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileStat.size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${fileStat.size}`);
        res.end();
        return true;
      }

      const safeEnd = Math.min(end, fileStat.size - 1);
      res.statusCode = 206;
      res.setHeader('Content-Length', safeEnd - start + 1);
      res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${fileStat.size}`);
      if (req.method === 'HEAD') res.end();
      else createLocalFileReadStream(key, { start, end: safeEnd }).pipe(res);
      return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', fileStat.size);
    if (req.method === 'HEAD') res.end();
    else createLocalFileReadStream(key).pipe(res);
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  await validateProductionStartupSecurity();
  if (STORAGE_DRIVER === 'local' || NEW_UPLOAD_DRIVER === 'local') {
    await validateLocalUploadDirectoryWritable();
  }
  await app.prepare();
  const stopCleanupWorker = !dev ? startMaterialCleanupWorker() : async () => undefined;
  const server = createServer(async (req, res) => {
    try {
      if (await tryServeNextStatic(req, res)) return;
      if (await tryServeLocalUpload(req, res)) return;
      enforceNoStoreForHtmlPage(req, res);
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      if (req.url?.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const message = dev && err instanceof Error ? err.message : 'Internal server error';
        res.end(JSON.stringify({ code: 1, message }));
        return;
      }

      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : 'production'
      }`,
    );
  });
  const shutdown = () => { void stopCleanupWorker().finally(() => server.close()); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

void startServer().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown startup validation error';
  console.error(`Startup validation failed: ${message}`);
  process.exit(1);
});
