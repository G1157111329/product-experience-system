import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { validateProductionStartupSecurity } from './lib/server/startup-security';
import {
  createLocalFileReadStream,
  getLocalContentType,
  isLocalUploadPublicAccess,
  LOCAL_PUBLIC_BASE_PATH,
  statLocalFile,
  STORAGE_DRIVER,
} from './lib/server/storage';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

validateProductionStartupSecurity();

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      if (await tryServeLocalUpload(req, res)) return;
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
});
