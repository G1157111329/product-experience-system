import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { report_id } = body;

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少report_id' }, { status: 400 });
  }

  const { data: report, error } = await client.from('reports').select('*').eq('id', report_id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const content = report.content as Record<string, unknown> | null;
  if (!content) {
    return NextResponse.json({ code: 1, message: '报告内容为空' }, { status: 400 });
  }

  // Return the full report data so the client can render a print-friendly view
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: report,
  });
}
