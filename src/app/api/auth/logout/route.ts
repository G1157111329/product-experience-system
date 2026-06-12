import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/auth';

export async function POST() {
  const response = NextResponse.json({ code: 0, message: '已退出登录' });
  clearSessionCookie(response);
  return response;
}
