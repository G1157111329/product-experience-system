import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { assertAdmin, ensureDefaultSkillTemplates, logAgentAudit } from '@/lib/server/agent-skills';
import type { AgentSkillKey } from '@/lib/agent-skills';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const adminUserId = request.nextUrl.searchParams.get('admin_user_id');
  await ensureDefaultSkillTemplates(client, adminUserId);

  const { data, error } = await client
    .from('agent_skill_templates')
    .select('*, agent_skill_versions(*)')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const templates = (data || []).map((template: Record<string, unknown>) => {
    const versions = (template.agent_skill_versions || []) as Array<Record<string, unknown>>;
    return {
      ...template,
      active_version: versions.find((version) => version.id === template.active_version_id) || null,
      agent_skill_versions: versions.sort((a, b) => Number(b.version || 0) - Number(a.version || 0)),
    };
  });

  return NextResponse.json({ code: 0, message: 'success', data: templates });
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
