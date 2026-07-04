/**
 * V4.0 issue lifecycle services: occurrences, rectifications, verifications.
 *
 * These helpers operate on the V3.1 contract tables
 * (issue_occurrences / rectification_actions / verifications) and are used by
 * both API routes and report-detail loaders.
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

type ClientLike = ReturnType<typeof getSupabaseClient>;

export interface CreateOccurrenceInput {
  issueId: string;
  reportId?: string | null;
  taskId?: string | null;
  projectPhase?: string | null;
  occurredOn?: string | null; // ISO date string
  occurrenceNote?: string | null;
  evidenceRefs?: string[] | null;
}

export interface CreateRectificationInput {
  issueId: string;
  actionPlan: string;
  responsiblePerson?: string | null;
  responsibleDept?: string | null;
  planCompleteDate?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export interface CreateVerificationInput {
  rectificationActionId: string;
  issueId: string;
  result: 'passed' | 'failed' | 'partial';
  note?: string | null;
  verifiedBy?: string | null;
  evidenceRefs?: string[] | null;
}

export interface OccurrenceWithContext {
  id: string;
  issueId: string;
  reportId: string | null;
  taskId: string | null;
  projectPhase: string | null;
  occurredOn: string | null;
  occurrenceNote: string | null;
  evidenceRefs: unknown;
  createdAt: string;
}

export interface RectificationWithVerifications {
  id: string;
  issueId: string;
  actionPlan: string;
  responsiblePerson: string | null;
  responsibleDept: string | null;
  planCompleteDate: string | null;
  actualCompleteDate: string | null;
  status: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  verifications: VerificationRecord[];
}

export interface VerificationRecord {
  id: string;
  rectificationActionId: string;
  issueId: string;
  result: string;
  note: string | null;
  verifiedBy: string | null;
  verifiedAt: string;
  evidenceRefs: unknown;
}

export async function createIssueOccurrence(
  client: ClientLike,
  input: CreateOccurrenceInput,
): Promise<{ data: OccurrenceWithContext | null; error?: { message: string } | null }> {
  const { data, error } = await client
    .from('issue_occurrences')
    .insert({
      issue_id: input.issueId,
      report_id: input.reportId ?? null,
      task_id: input.taskId ?? null,
      project_phase: input.projectPhase ?? null,
      occurred_on: input.occurredOn ?? null,
      occurrence_note: input.occurrenceNote ?? null,
      evidence_refs: input.evidenceRefs ?? [],
    })
    .select()
    .single();

  return { data: data as OccurrenceWithContext | null, error };
}

export async function getIssueOccurrenceTimeline(
  client: ClientLike,
  issueId: string,
): Promise<OccurrenceWithContext[]> {
  const { data, error } = await client
    .from('issue_occurrences')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`failed_to_load_occurrences: ${error.message}`);
  return (data || []) as OccurrenceWithContext[];
}

export async function getCrossStageOccurrences(
  client: ClientLike,
  productModel: string,
  excludeIssueId?: string,
): Promise<{ issueId: string; title: string; occurrences: OccurrenceWithContext[] }[]> {
  let query = client.from('issues').select('id, title').eq('product_model', productModel);
  if (excludeIssueId) query = query.neq('id', excludeIssueId);

  const { data: issues, error: issuesError } = await query;
  if (issuesError) throw new Error(`failed_to_load_issues: ${issuesError.message}`);
  if (!issues || issues.length === 0) return [];

  const issueIds = issues.map((issue: { id: string }) => issue.id);
  const { data: occurrences, error: occError } = await client
    .from('issue_occurrences')
    .select('*')
    .in('issue_id', issueIds)
    .order('created_at', { ascending: false });

  if (occError) throw new Error(`failed_to_load_occurrences: ${occError.message}`);

  const grouped = new Map<string, OccurrenceWithContext[]>();
  for (const occ of (occurrences || []) as OccurrenceWithContext[]) {
    const list = grouped.get(occ.issueId) || [];
    list.push(occ);
    grouped.set(occ.issueId, list);
  }

  return issues.map((issue: { id: string; title: string }) => ({
    issueId: issue.id,
    title: issue.title,
    occurrences: grouped.get(issue.id) || [],
  }));
}

export async function getIssueHistoryCount(
  client: ClientLike,
  issueTitle: string,
  productModel: string,
  excludeIssueId?: string,
): Promise<number> {
  let query = client
    .from('issues')
    .select('id')
    .eq('title', issueTitle)
    .eq('product_model', productModel);
  if (excludeIssueId) query = query.neq('id', excludeIssueId);

  const { data: issues, error: issuesError } = await query;
  if (issuesError) throw new Error(`failed_to_count_history: ${issuesError.message}`);
  if (!issues || issues.length === 0) return 0;

  const issueIds = issues.map((issue: { id: string }) => issue.id);
  const { count, error: countError } = await client
    .from('issue_occurrences')
    .select('*', { count: 'exact' })
    .in('issue_id', issueIds);

  if (countError) throw new Error(`failed_to_count_occurrences: ${countError.message}`);
  return count || 0;
}

export async function createRectificationAction(
  client: ClientLike,
  input: CreateRectificationInput,
): Promise<{ data: RectificationWithVerifications | null; error?: { message: string } | null }> {
  const { data, error } = await client
    .from('rectification_actions')
    .insert({
      issue_id: input.issueId,
      action_plan: input.actionPlan,
      responsible_person: input.responsiblePerson ?? null,
      responsible_dept: input.responsibleDept ?? null,
      plan_complete_date: input.planCompleteDate ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
      status: 'in_progress',
    })
    .select()
    .single();

  if (error) return { data: null, error };
  return {
    data: {
      ...(data as RectificationWithVerifications),
      verifications: [],
    },
    error: null,
  };
}

export async function getRectificationHistory(
  client: ClientLike,
  issueId: string,
): Promise<RectificationWithVerifications[]> {
  const { data: actions, error: actionsError } = await client
    .from('rectification_actions')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });

  if (actionsError) throw new Error(`failed_to_load_rectifications: ${actionsError.message}`);
  if (!actions || actions.length === 0) return [];

  const actionIds = actions.map((action: { id: string }) => action.id);
  const { data: verifications, error: verifError } = await client
    .from('verifications')
    .select('*')
    .in('rectification_action_id', actionIds)
    .order('verified_at', { ascending: false });

  if (verifError) throw new Error(`failed_to_load_verifications: ${verifError.message}`);

  const grouped = new Map<string, VerificationRecord[]>();
  for (const v of (verifications || []) as VerificationRecord[]) {
    const list = grouped.get(v.rectificationActionId) || [];
    list.push(v);
    grouped.set(v.rectificationActionId, list);
  }

  return actions.map((action: RectificationWithVerifications) => ({
    ...action,
    verifications: grouped.get(action.id) || [],
  }));
}

export async function updateRectificationAction(
  client: ClientLike,
  actionId: string,
  updates: Partial<{
    actionPlan: string;
    responsiblePerson: string | null;
    responsibleDept: string | null;
    planCompleteDate: string | null;
    actualCompleteDate: string | null;
    status: 'planned' | 'in_progress' | 'completed' | 'abandoned';
    note: string | null;
  }>,
): Promise<{ data: RectificationWithVerifications | null; error?: { message: string } | null }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.actionPlan !== undefined) payload.action_plan = updates.actionPlan;
  if (updates.responsiblePerson !== undefined) payload.responsible_person = updates.responsiblePerson;
  if (updates.responsibleDept !== undefined) payload.responsible_dept = updates.responsibleDept;
  if (updates.planCompleteDate !== undefined) payload.plan_complete_date = updates.planCompleteDate;
  if (updates.actualCompleteDate !== undefined) payload.actual_complete_date = updates.actualCompleteDate;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.note !== undefined) payload.note = updates.note;

  const { data, error } = await client
    .from('rectification_actions')
    .update(payload)
    .eq('id', actionId)
    .select()
    .single();

  if (error) return { data: null, error };
  const history = await getRectificationHistory(client, data.issue_id);
  return { data: history.find((action) => action.id === actionId) || null, error: null };
}

export async function createVerification(
  client: ClientLike,
  input: CreateVerificationInput,
): Promise<{ data: VerificationRecord | null; error?: { message: string } | null }> {
  const { data, error } = await client
    .from('verifications')
    .insert({
      rectification_action_id: input.rectificationActionId,
      issue_id: input.issueId,
      result: input.result,
      note: input.note ?? null,
      verified_by: input.verifiedBy ?? null,
      evidence_refs: input.evidenceRefs ?? [],
    })
    .select()
    .single();

  return { data: data as VerificationRecord | null, error };
}
