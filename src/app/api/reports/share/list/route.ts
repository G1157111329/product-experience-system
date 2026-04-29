import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET: List share links for a report
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const report_id = searchParams.get('report_id');

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少报告ID' }, { status: 400 });
  }

  const { data, error } = await client.from('report_shares')
    .select('id, share_token, expires_at, created_by, created_at')
    .eq('report_id', report_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // Mark expired shares
  const now = new Date();
  const enriched = (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    is_expired: s.expires_at ? new Date(s.expires_at as string) < now : false,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: enriched });
}

// DELETE: Revoke a share link
export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ code: 1, message: '缺少分享ID' }, { status: 400 });
  }

  const { error } = await client.from('report_shares').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: '分享链接已撤销' });
}
