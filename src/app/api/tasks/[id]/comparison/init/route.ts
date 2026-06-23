import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { createAssemblyFromComparisonTask, findAssemblyForTask } from '@/lib/server/comparison-assembly';

/**
 * V2.3 comparison task assembly initialization.
 * POST is idempotent: repeated calls return the existing assembly.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  const accessible = await canAccessTask(client, user, taskId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const existingAssembly = await findAssemblyForTask(client, taskId);
    if (existingAssembly) {
      return NextResponse.json({ code: 0, message: 'success', data: existingAssembly });
    }

    const assembly = await createAssemblyFromComparisonTask(client, taskId, {
      name: body.name,
      layoutType: body.layout_type,
      comparisonIntent: body.comparison_intent,
    });
    return NextResponse.json({ code: 0, message: '初始化对比组装成功', data: assembly });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '初始化失败' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/tasks/[id]/comparison/init
 * Return the assembly associated with this task, if one exists.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  const accessible = await canAccessTask(client, user, taskId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const assembly = await findAssemblyForTask(client, taskId);
  return NextResponse.json({ code: 0, message: 'success', data: assembly });
}
