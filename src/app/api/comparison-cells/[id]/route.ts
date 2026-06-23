import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

const allowedJsonFields = new Set([
  'params',
  'process_notes',
  'problem_points',
  'metric_values',
  'media_display_config',
]);

const allowedScalarFields = new Set([
  'effect_summary',
  'manual_score',
  'ai_score',
  'conclusion_tag',
  'ai_status',
]);

async function getCell(client: ReturnType<typeof getSupabaseClient>, cellId: string) {
  return client
    .from('comparison_matrix_cells')
    .select('*')
    .eq('id', cellId)
    .maybeSingle();
}

function validateJsonField(field: string, value: unknown) {
  if (value === null) return null;
  if (field === 'process_notes' || field === 'problem_points') {
    return Array.isArray(value) ? null : `${field} 必须是数组`;
  }
  return typeof value === 'object' && !Array.isArray(value) ? null : `${field} 必须是对象`;
}

function validateScoreValue(field: string, value: unknown) {
  if (value === null || value === '') return { error: null, value: null };
  const score = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return { error: `${field} 必须是 0-10 的数字`, value: null };
  }
  return { error: null, value: String(score) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const { data: cell, error } = await getCell(client, id);
  if (error) {
    return NextResponse.json({ code: 1, message: error.message || '查询失败' }, { status: 500 });
  }
  if (!cell?.assembly_id) {
    return NextResponse.json({ code: 1, message: '未找到矩阵单元格' }, { status: 404 });
  }

  const accessible = await canAccessAssembly(client, user, String(cell.assembly_id));
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  return NextResponse.json({ code: 0, message: 'success', data: cell });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id } = await params;
  const { data: cell, error: cellError } = await getCell(client, id);
  if (cellError) {
    return NextResponse.json({ code: 1, message: cellError.message || '查询失败' }, { status: 500 });
  }
  if (!cell?.assembly_id) {
    return NextResponse.json({ code: 1, message: '未找到矩阵单元格' }, { status: 404 });
  }

  const accessible = await canAccessAssembly(client, user, String(cell.assembly_id));
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedJsonFields) {
    if (body[field] === undefined) continue;
    const validationError = validateJsonField(field, body[field]);
    if (validationError) {
      return NextResponse.json({ code: 1, message: validationError }, { status: 400 });
    }
    update[field] = body[field];
  }

  for (const field of allowedScalarFields) {
    if (body[field] === undefined) continue;
    if (field === 'manual_score' || field === 'ai_score') {
      const result = validateScoreValue(field, body[field]);
      if (result.error) {
        return NextResponse.json({ code: 1, message: result.error }, { status: 400 });
      }
      update[field] = result.value;
    } else {
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ code: 1, message: '无更新字段' }, { status: 400 });
  }

  const { data, error } = await client
    .from('comparison_matrix_cells')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ code: 1, message: error.message || '更新失败' }, { status: 500 });
  }

  return NextResponse.json({ code: 0, message: '更新成功', data });
}
