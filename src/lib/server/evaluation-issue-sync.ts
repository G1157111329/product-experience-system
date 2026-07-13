import type { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  evaluationIssueTitle,
  normalizeEvaluationStatus,
  type EvaluationStatus,
} from '@/lib/evaluation-status';

export type EvaluationIssueSourceKind = 'recipe' | 'record';

export type EvaluationIssue = {
  id: string;
  taskId: string;
  title: string;
  sourceType: 'recipe_problem' | 'record_fail';
  recipeId: string | null;
  recordId: string | null;
  status: string;
  productModel?: string | null;
  level?: string | null;
  source?: string | null;
  description?: string | null;
};

export type EvaluationIssueCreate = Omit<EvaluationIssue, 'id'>;
export type EvaluationIssuePatch = Partial<Pick<
  EvaluationIssue,
  'title' | 'productModel' | 'level' | 'source' | 'description'
>>;

export interface EvaluationIssueRepository {
  findBySource(sourceKind: EvaluationIssueSourceKind, sourceId: string): Promise<EvaluationIssue | null>;
  create(values: EvaluationIssueCreate): Promise<EvaluationIssue>;
  update(id: string, values: EvaluationIssuePatch): Promise<EvaluationIssue>;
}

export type SyncEvaluationIssueInput = {
  taskId: string;
  sourceKind: EvaluationIssueSourceKind;
  sourceId: string;
  subjectName: string;
  status: unknown;
  productModel?: string | null;
  level?: string | null;
  source?: string | null;
  description?: string | null;
};

export type SyncEvaluationIssueResult = {
  status: EvaluationStatus;
  created: boolean;
  issue: EvaluationIssue | null;
};

export async function syncEvaluationIssue(
  repository: EvaluationIssueRepository,
  input: SyncEvaluationIssueInput,
): Promise<SyncEvaluationIssueResult> {
  const status = normalizeEvaluationStatus(input.status);
  const existing = await repository.findBySource(input.sourceKind, input.sourceId);

  if (status === 'qualified') return { status, created: false, issue: existing };

  const title = evaluationIssueTitle(input.subjectName, input.sourceKind, status);
  const patch: EvaluationIssuePatch = { title };
  if (input.productModel !== undefined) patch.productModel = input.productModel;
  if (input.level !== undefined) patch.level = input.level;
  if (input.source !== undefined) patch.source = input.source;
  if (input.description !== undefined) patch.description = input.description;
  if (existing) {
    return { status, created: false, issue: await repository.update(existing.id, patch) };
  }

  try {
    const issue = await repository.create({
      taskId: input.taskId,
      title,
      sourceType: input.sourceKind === 'recipe' ? 'recipe_problem' : 'record_fail',
      recipeId: input.sourceKind === 'recipe' ? input.sourceId : null,
      recordId: input.sourceKind === 'record' ? input.sourceId : null,
      status: 'open',
      productModel: input.productModel ?? null,
      level: input.level ?? '二类',
      source: input.source ?? (input.sourceKind === 'recipe' ? '功能/食谱效果评价' : '体验检查'),
      description: input.description ?? null,
    });
    return { status, created: true, issue };
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') throw error;
    const concurrent = await repository.findBySource(input.sourceKind, input.sourceId);
    if (!concurrent) throw error;
    return { status, created: false, issue: await repository.update(concurrent.id, patch) };
  }
}

type SupabaseClient = ReturnType<typeof getSupabaseClient>;
type DatabaseIssueRow = {
  id: string;
  task_id: string;
  title: string;
  source_type: 'recipe_problem' | 'record_fail';
  recipe_id?: string | null;
  record_id?: string | null;
  status: string;
  product_model?: string | null;
  level?: string | null;
  source?: string | null;
  description?: string | null;
};

function fromDatabaseIssue(row: DatabaseIssueRow): EvaluationIssue {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    sourceType: row.source_type,
    recipeId: row.recipe_id ?? null,
    recordId: row.record_id ?? null,
    status: row.status,
    productModel: row.product_model ?? null,
    level: row.level ?? null,
    source: row.source ?? null,
    description: row.description ?? null,
  };
}

export function createSupabaseEvaluationIssueRepository(client: SupabaseClient): EvaluationIssueRepository {
  const findBySource = async (sourceKind: EvaluationIssueSourceKind, sourceId: string) => {
    let query = client
      .from('issues')
      .select('id, task_id, title, source_type, recipe_id, record_id, status, product_model, level, source, description')
      .eq('source_type', sourceKind === 'recipe' ? 'recipe_problem' : 'record_fail')
      .is('source_report_id', null);
    query = sourceKind === 'recipe' ? query.eq('recipe_id', sourceId) : query.eq('record_id', sourceId);
    const { data, error } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromDatabaseIssue(data as DatabaseIssueRow) : null;
  };

  return {
    findBySource,
    async create(values) {
      const payload = {
        task_id: values.taskId,
        title: values.title,
        source_type: values.sourceType,
        recipe_id: values.recipeId,
        record_id: values.recordId,
        status: values.status,
        product_model: values.productModel ?? null,
        level: values.level ?? null,
        source: values.source ?? null,
        description: values.description ?? null,
      };
      const { data, error } = await client.from('issues').insert(payload).select().single();
      if (error) {
        throw Object.assign(new Error(error.message), { code: error.code });
      }
      return fromDatabaseIssue(data as DatabaseIssueRow);
    },
    async update(id, values) {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (values.title !== undefined) payload.title = values.title;
      if (values.productModel !== undefined) payload.product_model = values.productModel;
      if (values.level !== undefined) payload.level = values.level;
      if (values.source !== undefined) payload.source = values.source;
      if (values.description !== undefined) payload.description = values.description;
      const { data, error } = await client.from('issues').update(payload).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return fromDatabaseIssue(data as DatabaseIssueRow);
    },
  };
}
