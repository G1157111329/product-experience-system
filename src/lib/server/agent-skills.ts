import { getDefaultSkillDefinitions, type AgentSkillKey } from '@/lib/agent-skills';

type QueryResult<T = Record<string, unknown>> = Promise<{ data: T | null; error?: { message?: string } | null }>;

type QueryBuilderLike = PromiseLike<{ data: unknown; error?: { message?: string } | null }> & {
  select: (...args: unknown[]) => QueryBuilderLike;
  eq: (...args: unknown[]) => QueryBuilderLike;
  maybeSingle: () => QueryResult;
  insert: (...args: unknown[]) => QueryBuilderLike;
  update: (...args: unknown[]) => QueryBuilderLike;
  single: () => QueryResult;
};

export type SupabaseClientLike = {
  from: (table: string) => QueryBuilderLike;
};

export interface AgentAuditInput {
  skillKey: AgentSkillKey;
  templateId?: string | null;
  versionId?: string | null;
  action: 'create_version' | 'activate_version' | 'enable' | 'disable' | 'run' | 'accept_suggestion' | 'reject_suggestion';
  actorUserId?: string | null;
  taskId?: string | null;
  requestSnapshot?: Record<string, unknown>;
  responseSnapshot?: Record<string, unknown>;
  status?: 'success' | 'failed';
  errorMessage?: string | null;
}

export async function assertAdmin(client: SupabaseClientLike, adminUserId: string | null | undefined): Promise<void> {
  if (!adminUserId) throw new Error('缺少管理员用户');
  const { data: admin } = await client
    .from('platform_users')
    .select('role')
    .eq('id', adminUserId)
    .maybeSingle();
  if (!admin || admin.role !== 'admin') throw new Error('无权限');
}

export async function logAgentAudit(client: SupabaseClientLike, input: AgentAuditInput): Promise<void> {
  await client.from('agent_skill_audit_logs').insert({
    skill_key: input.skillKey,
    template_id: input.templateId || null,
    version_id: input.versionId || null,
    action: input.action,
    actor_user_id: input.actorUserId || null,
    task_id: input.taskId || null,
    request_snapshot: input.requestSnapshot || {},
    response_snapshot: input.responseSnapshot || {},
    status: input.status || 'success',
    error_message: input.errorMessage || null,
  });
}

export async function ensureDefaultSkillTemplates(client: SupabaseClientLike, adminUserId?: string | null): Promise<void> {
  for (const skill of getDefaultSkillDefinitions()) {
    const { data: existing } = await client
      .from('agent_skill_templates')
      .select('*')
      .eq('skill_key', skill.skillKey)
      .maybeSingle() as Awaited<QueryResult>;

    if (existing) continue;

    const { data: template, error: templateError } = await client
      .from('agent_skill_templates')
      .insert({
        skill_key: skill.skillKey,
        name: skill.name,
        description: skill.description,
        is_enabled: true,
        created_by: adminUserId || null,
      })
      .select()
      .single() as Awaited<QueryResult>;

    if (templateError || !template) continue;

    const { data: version } = await client
      .from('agent_skill_versions')
      .insert({
        template_id: template.id,
        version: 1,
        system_prompt: skill.systemPrompt,
        user_prompt_template: skill.userPromptTemplate,
        output_schema: skill.outputSchema,
        notes: '系统默认模板',
        created_by: adminUserId || null,
      })
      .select()
      .single() as Awaited<QueryResult>;

    if (version?.id) {
      await client
        .from('agent_skill_templates')
        .update({ active_version_id: version.id, updated_at: new Date().toISOString() })
        .eq('id', template.id);
    }
  }
}

export async function getActiveSkillVersion(client: SupabaseClientLike, skillKey: AgentSkillKey) {
  const { data: template } = await client
    .from('agent_skill_templates')
    .select('*')
    .eq('skill_key', skillKey)
    .maybeSingle() as Awaited<QueryResult>;

  if (!template || template.is_enabled === false || !template.active_version_id) return null;

  const { data: version } = await client
    .from('agent_skill_versions')
    .select('*')
    .eq('id', template.active_version_id)
    .maybeSingle() as Awaited<QueryResult>;

  if (!version) return null;
  return { template, version };
}
