import { NextRequest, NextResponse } from 'next/server';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isProtectedLocalUploadPath(request: NextRequest) {
  const publicBasePath = process.env.LOCAL_PUBLIC_BASE_PATH || '/uploads';
  const normalizedBasePath = `/${publicBasePath.replace(/^\/+|\/+$/g, '')}`;
  return request.nextUrl.pathname === normalizedBasePath
    || request.nextUrl.pathname.startsWith(`${normalizedBasePath}/`);
}

function sameOrigin(request: NextRequest, value: string | null) {
  if (!value) return true;
  try {
    const incoming = new URL(value);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
    return incoming.host === host && incoming.protocol.replace(':', '') === proto;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'production'
    && process.env.LOCAL_UPLOAD_PUBLIC_ACCESS === 'protected'
    && isProtectedLocalUploadPath(request)
  ) {
    return NextResponse.json({ code: 1, message: '素材静态直连已关闭' }, { status: 404 });
  }

  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    STATE_CHANGING_METHODS.has(request.method)
  ) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    if (!sameOrigin(request, origin) || !sameOrigin(request, referer)) {
      return NextResponse.json({ code: 1, message: '跨站请求已被拒绝' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/uploads/:path*'],
};
