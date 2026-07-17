import { NextRequest, NextResponse } from 'next/server';
import { GET as fileRouteGET } from '../../file/[...key]/route';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const fileKey = Buffer.from(token, 'base64url').toString('utf8');
  const canonicalToken = Buffer.from(fileKey, 'utf8').toString('base64url');
  if (!fileKey || canonicalToken !== token || fileKey.includes('\0')) {
    return NextResponse.json({ code: 1, message: '无效的视频地址' }, { status: 400 });
  }

  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.set('x-xp-video-single-stream', '1');
  const singleStreamRequest = new NextRequest(request.url, { method: 'GET', headers });
  const response = await fileRouteGET(singleStreamRequest, {
    params: Promise.resolve({ key: fileKey.split('/') }),
  });
  response.headers.delete('accept-ranges');
  response.headers.delete('content-range');
  response.headers.set('x-xp-video-transport', 'single-stream');
  return response;
}
