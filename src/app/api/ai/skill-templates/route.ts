import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { assertAdmin, ensureDefaultSkillTemplates, logAgentAudit } from '@/lib/server/agent-skills';
import type { AgentSkillKey } from '@/lib/agent-skills';

function readField<T>(row: Record<string, unknown>, snakeKey: string, camelKey: string, fallback: T): T {
  return (row[snakeKey] ?? row[camelKey] ?? fallback) as T;
}

function formatSkillTemplateError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes('ECONNREFUSED') || message.includes('Failed query')) {
    return 'Prompt 模板读取失败，请确认数据库已连接，并已执行 AI Agent Skills 初始化 SQL。';
  }
  return message || fallback;
}

async function listSkillTemplates(client: ReturnType<typeof getSupabaseClient>) {
  const { data, error } = await client
    .from('agent_skill_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return { templates: [], error };

  const { data: versionData, error: versionError } = await client
    .from('agent_skill_versions')
    .select('*')
    .order('version', { ascending: false });

  if (versionError) return { templates: [], error: versionError };

  const versionsByTemplate = new Map<string, Array<Record<string, unknown>>>();
  for (const rawVersion of (versionData || []) as Array<Record<string, unknown>>) {
    const version = {
      ...rawVersion,
      template_id: readField(rawVersion, 'template_id', 'templateId', ''),
      system_prompt: readField(rawVersion, 'system_prompt', 'systemPrompt', ''),
      user_prompt_template: readField(rawVersion, 'user_prompt_template', 'userPromptTemplate', ''),
      output_schema: readField(rawVersion, 'output_schema', 'outputSchema', {}),
      created_by: readField(rawVersion, 'created_by', 'createdBy', null),
      created_at: readField(rawVersion, 'created_at', 'createdAt', null),
    };
    const templateId = version.template_id as string;
    versionsByTemplate.set(templateId, [...(versionsByTemplate.get(templateId) || []), version]);
  }

  const templates = (data || []).map((template: Record<string, unknown>) => {
    const id = readField(template, 'id', 'id', '');
    const activeVersionId = readField<string | null>(template, 'active_version_id', 'activeVersionId', null);
    const versions = (versionsByTemplate.get(id) || []).sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
    return {
      ...template,
      id,
      skill_key: readField(template, 'skill_key', 'skillKey', ''),
      is_enabled: readField(template, 'is_enabled', 'isEnabled', true),
      active_version_id: activeVersionId,
      model_config_id: readField(template, 'model_config_id', 'modelConfigId', null),
      created_by: readField(template, 'created_by', 'createdBy', null),
      created_at: readField(template, 'created_at', 'createdAt', null),
      updated_at: readField(template, 'updated_at', 'updatedAt', null),
      active_version: versions.find((version) => version.id === activeVersionId) || null,
      agent_skill_versions: versions,
    };
  });

  return { templates, error: null };
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const adminUserId = request.nextUrl.searchParams.get('admin_user_id');
  try {
    const initResult = await ensureDefaultSkillTemplates(client, adminUserId);
    const { templates, error } = await listSkillTemplates(client);

    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

    return NextResponse.json({ code: 0, message: 'success', data: templates, meta: initResult });
  } catch (err) {
    return NextResponse.json({ code: 1, message: formatSkillTemplateError(err, 'Prompt 模板读取失败') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  try {
    await assertAdmin(client, body.admin_user_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无权限';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  if (body.action === 'ensure_defaults') {
    try {
      const initResult = await ensureDefaultSkillTemplates(client, body.admin_user_id);
      const { templates, error } = await listSkillTemplates(client);
      if (error) return NextResponse.json({ code: 1, message: error.message, meta: initResult }, { status: 500 });
      if (templates.length === 0 && initResult.errors.length > 0) {
        return NextResponse.json({ code: 1, message: initResult.errors.join('；'), data: templates, meta: initResult }, { status: 500 });
      }
      return NextResponse.json({ code: 0, message: 'Prompt 模板已初始化', data: templates, meta: initResult });
    } catch (err) {
      return NextResponse.json({ code: 1, message: formatSkillTemplateError(err, 'Prompt 模板初始化失败') }, { status: 500 });
    }
  }

  if (!body.template_id) return NextResponse.json({ code: 1, message: '缺少 Skill ID' }, { status: 400 });

  const { data: versions } = await client
    .from('agent_skill_versions')
    .select('version')
    .eq('template_id', body.template_id)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = Number(versions?.[0]?.version || 0) + 1;
  const { data, error } = await client
    .from('agent_skill_versions')
    .insert({
      template_id: body.template_id,
      version: nextVersion,
      system_prompt: body.system_prompt || '',
      user_prompt_template: body.user_prompt_template || '',
      output_schema: body.output_schema || {},
      notes: body.notes || null,
      created_by: body.admin_user_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const { data: template } = await client
    .from('agent_skill_templates')
    .select('skill_key')
    .eq('id', body.template_id)
    .maybeSingle();

  if (template?.skill_key) {
    await logAgentAudit(client, {
      skillKey: template.skill_key as AgentSkillKey,
      templateId: body.template_id,
      versionId: data.id,
      action: 'create_version',
      actorUserId: body.admin_user_id,
      requestSnapshot: { notes: body.notes || null },
      responseSnapshot: { version: nextVersion },
    });
  }

  return NextResponse.json({ code: 0, message: 'Skill 版本已创建', data });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  try {
    await assertAdmin(client, body.admin_user_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无权限';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  if (!body.template_id) return NextResponse.json({ code: 1, message: '缺少 Skill ID' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let auditAction: 'activate_version' | 'enable' | 'disable' = 'activate_version';

  if (typeof body.is_enabled === 'boolean') {
    updates.is_enabled = body.is_enabled;
    auditAction = body.is_enabled ? 'enable' : 'disable';
  }
  if (body.active_version_id) {
    updates.active_version_id = body.active_version_id;
    auditAction = 'activate_version';
  }
  if (body.model_config_id !== undefined) updates.model_config_id = body.model_config_id || null;

  const { data, error } = await client
    .from('agent_skill_templates')
    .update(updates)
    .eq('id', body.template_id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  await logAgentAudit(client, {
    skillKey: data.skill_key as AgentSkillKey,
    templateId: body.template_id,
    versionId: body.active_version_id || data.active_version_id || null,
    action: auditAction,
    actorUserId: body.admin_user_id,
    requestSnapshot: updates,
    responseSnapshot: { template_id: body.template_id },
  });

  return NextResponse.json({ code: 0, message: 'Skill 设置已保存', data });
}
