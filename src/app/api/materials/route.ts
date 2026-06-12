import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
import { deleteFile, generatePresignedUrl } from '@/lib/server/storage';

type MaterialScope = {
  task_id?: string | null;
  record_id?: string | null;
  recipe_step_id?: string | null;
  recipe_library_step_id?: string | null;
  recipe_id?: string | null;
  issue_id?: string | null;
  re_evaluation_id?: string | null;
};

async function getTaskIdForMaterialScope(client: ReturnType<typeof getSupabaseClient>, scope: MaterialScope) {
  if (scope.task_id) return scope.task_id;
  if (scope.record_id) {
    const { data } = await client.from('check_records').select('task_id').eq('id', scope.record_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.recipe_id) {
    const { data } = await client.from('recipes').select('task_id').eq('id', scope.recipe_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.recipe_step_id) {
    const { data: step } = await client.from('recipe_steps').select('recipe_id').eq('id', scope.recipe_step_id).maybeSingle();
    if (!step?.recipe_id) return null;
    const { data: recipe } = await client.from('recipes').select('task_id').eq('id', step.recipe_id).maybeSingle();
    return recipe?.task_id ? String(recipe.task_id) : null;
  }
  if (scope.issue_id) {
    const { data } = await client.from('issues').select('task_id').eq('id', scope.issue_id).maybeSingle();
    return data?.task_id ? String(data.task_id) : null;
  }
  if (scope.re_evaluation_id) {
    const { data: reEval } = await client.from('issue_re_evaluations').select('issue_id').eq('id', scope.re_evaluation_id).maybeSingle();
    if (!reEval?.issue_id) return null;
    const { data: issue } = await client.from('issues').select('task_id').eq('id', reEval.issue_id).maybeSingle();
    return issue?.task_id ? String(issue.task_id) : null;
  }
  return null;
}

async function canUseMaterialScope(client: ReturnType<typeof getSupabaseClient>, user: AuthUser, scope: MaterialScope) {
  if (scope.recipe_library_step_id) return user.role === 'admin';
  const taskId = await getTaskIdForMaterialScope(client, scope);
  return Boolean(taskId && await canAccessTask(client, user, taskId));
}

async function withAccessibleFileUrls<T extends { file_path?: string | null; file_url?: string | null }>(materials: T[]) {
  return Promise.all(materials.map(async (material) => {
    const fileKey = material.file_path || material.file_url;
    if (!fileKey || fileKey.startsWith('http') || fileKey.startsWith('data:')) return material;

    try {
      return {
        ...material,
        file_url: await generatePresignedUrl({ key: fileKey, expireTime: 30 * 60 }),
      };
    } catch (error) {
      console.error('[materials] URL generation failed:', fileKey, error);
      return material;
    }
  }));
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const scope = {
    task_id: searchParams.get('task_id'),
    record_id: searchParams.get('record_id'),
    recipe_step_id: searchParams.get('recipe_step_id'),
    recipe_library_step_id: searchParams.get('recipe_library_step_id'),
    recipe_id: searchParams.get('recipe_id'),
    issue_id: searchParams.get('issue_id'),
  };
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));

  if (!(await canUseMaterialScope(client, user, scope))) return forbidden();

  let query = client.from('materials').select('*');
  if (scope.task_id) query = query.eq('task_id', scope.task_id);
  if (scope.record_id) query = query.eq('record_id', scope.record_id);
  if (scope.recipe_step_id) query = query.eq('recipe_step_id', scope.recipe_step_id);
  if (scope.recipe_library_step_id) query = query.eq('recipe_library_step_id', scope.recipe_library_step_id);
  if (scope.recipe_id) query = query.eq('recipe_id', scope.recipe_id);
  if (scope.issue_id) query = query.eq('issue_id', scope.issue_id);

  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });

  const materials = await withAccessibleFileUrls(data || []);
  return NextResponse.json({ code: 0, message: 'success', data: materials });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { id, file_name, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id } = body;

  if (!id) {
    return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
  }

  const { data: material } = await client
    .from('materials')
    .select('id, task_id, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, recipe_library_step_id')
    .eq('id', id)
    .maybeSingle();
  if (!material) return NextResponse.json({ code: 1, message: '素材不存在' }, { status: 404 });

  if (!(await canUseMaterialScope(client, user, material))) return forbidden();
  const targetScope = { record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id };
  if (Object.values(targetScope).some((value) => value !== undefined && value !== null)) {
    if (!(await canUseMaterialScope(client, user, targetScope))) return forbidden();
  }

  const updateData: Record<string, unknown> = {};
  if (file_name !== undefined) updateData.file_name = file_name;
  if (record_id !== undefined) updateData.record_id = record_id;
  if (recipe_step_id !== undefined) updateData.recipe_step_id = recipe_step_id;
  if (recipe_id !== undefined) updateData.recipe_id = recipe_id;
  if (issue_id !== undefined) updateData.issue_id = issue_id;
  if (re_evaluation_id !== undefined) updateData.re_evaluation_id = re_evaluation_id;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ code: 1, message: '没有需要更新的字段' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materials')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少id' }, { status: 400 });

  const { data: material } = await client
    .from('materials')
    .select('file_path, file_url, task_id, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id, recipe_library_step_id')
    .eq('id', id)
    .single();

  if (!material) return NextResponse.json({ code: 1, message: '素材不存在' }, { status: 404 });
  if (!(await canUseMaterialScope(client, user, material))) return forbidden();

  const { error } = await client.from('materials').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });

  try {
    const fileKey = (material as { file_path?: string | null; file_url?: string | null } | null)?.file_path
      || (material as { file_path?: string | null; file_url?: string | null } | null)?.file_url;
    await deleteFile(fileKey);
  } catch (storageError) {
    console.error('[materials] Physical file delete failed:', storageError);
    return NextResponse.json({ code: 0, message: '删除成功', warning: 'physical_file_delete_failed' });
  }

  return NextResponse.json({ code: 0, message: '删除成功' });
}
