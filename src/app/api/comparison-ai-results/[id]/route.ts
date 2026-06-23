import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type Row = Record<string, unknown>;

function outputScore(output: unknown) {
  if (!output || typeof output !== 'object') return null;
  const score = Number((output as Row).score);
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  return String(Math.round(score * 10) / 10);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const { data: aiResult, error: loadError } = await client
    .from('comparison_ai_results')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ code: 1, message: loadError.message || '读取 AI 结果失败' }, { status: 500 });
  }
  if (!aiResult) {
    return NextResponse.json({ code: 1, message: 'AI 结果不存在' }, { status: 404 });
  }
  if (!(await canAccessAssembly(client, user, String(aiResult.assembly_id || '')))) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  if (aiResult.status !== 'generated') {
    return NextResponse.json({ code: 1, message: '只能确认或驳回 generated 状态的 AI 结果' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const nextStatus = body.status || body.action;
  if (nextStatus !== 'confirmed' && nextStatus !== 'rejected') {
    return NextResponse.json({ code: 1, message: 'status 必须是 confirmed 或 rejected' }, { status: 400 });
  }

  const update: Row = {
    status: nextStatus,
    confirmed_by: nextStatus === 'confirmed' ? user.id : null,
    confirmed_at: nextStatus === 'confirmed' ? new Date().toISOString() : null,
    rejected_reason: nextStatus === 'rejected' ? String(body.rejected_reason || '').slice(0, 1000) : null,
  };
  const { data: updated, error } = await client
    .from('comparison_ai_results')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ code: 1, message: error?.message || '更新 AI 结果失败' }, { status: 500 });
  }

  if (aiResult.level === 'cell') {
    const cellUpdate: Row = {
      ai_status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === 'confirmed') {
      const score = outputScore(aiResult.output);
      if (score !== null) cellUpdate.ai_score = score;
    }
    await client
      .from('comparison_matrix_cells')
      .update(cellUpdate)
      .eq('id', aiResult.target_id);
  }

  return NextResponse.json({ code: 0, message: `AI 结果已${nextStatus === 'confirmed' ? '确认' : '驳回'}`, data: updated });
}
