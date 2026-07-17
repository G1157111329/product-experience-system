import type { EvaluationStatus } from '@/lib/evaluation-status';

type IssueStatus = 'open' | 'rectifying' | 'verified_closed';

type RpcError = { message?: string } | null;
type RpcClient = {
  rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: RpcError }>;
};

type RetestRecord = {
  id: string;
  issue_id: string;
  description: string | null;
  result: EvaluationStatus;
  ai_result: unknown;
  created_at: string;
  created_by: string | null;
  [key: string]: unknown;
};

type RecalculatedIssue = {
  id: string;
  status: IssueStatus | 'waived';
  [key: string]: unknown;
};

export type IssueRetestMutationResult = {
  re_evaluation: RetestRecord | null;
  issue: RecalculatedIssue;
};

export type ClassifiedIssueRetestError = {
  status: 400 | 404 | 409 | 500;
  message: string;
  log: boolean;
};

class IssueRetestOperationError extends Error {
  constructor(
    readonly classified: ClassifiedIssueRetestError,
    readonly causeValue: unknown,
  ) {
    super(classified.message);
    this.name = 'IssueRetestOperationError';
  }
}

export function classifyIssueRetestError(error: unknown): ClassifiedIssueRetestError {
  if (error instanceof IssueRetestOperationError) return error.classified;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  if (message.includes('retest not found')) return { status: 404, message: '复测记录不存在', log: false };
  if (message.includes('issue not found')) return { status: 404, message: '问题不存在', log: false };
  if (message.includes('invalid retest result')) return { status: 400, message: '复测结果格式错误', log: false };
  if (message.includes('material_ids must be an array')) return { status: 400, message: '素材参数格式错误', log: false };
  if (message.includes('invalid retest material')) return { status: 400, message: '所选素材不属于该问题任务', log: false };
  if (message.includes('invalid or occupied retest material')) {
    return { status: 409, message: '所选素材不可用于本次复测，请刷新后重试', log: false };
  }
  return { status: 500, message: '复测操作失败', log: true };
}

function stableOperationError(error: unknown) {
  if (error instanceof IssueRetestOperationError) return error;
  return new IssueRetestOperationError(classifyIssueRetestError(error), error);
}

const RESULTS = new Set<EvaluationStatus>(['qualified', 'unqualified', 'pending']);

export function issueStatusForRetestResult(result: EvaluationStatus): IssueStatus {
  if (result === 'qualified') return 'verified_closed';
  if (result === 'unqualified') return 'rectifying';
  return 'open';
}

function assertResult(result: unknown): asserts result is EvaluationStatus {
  if (!RESULTS.has(result as EvaluationStatus)) throw new Error('invalid retest result');
}

function uniqueMaterialIds(ids: readonly string[] | undefined): string[] | undefined {
  if (ids === undefined) return undefined;
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

async function callApplyIssueRetest(client: RpcClient, command: Record<string, unknown>): Promise<IssueRetestMutationResult> {
  try {
    let data: unknown;
    let error: RpcError;
    if (typeof client.rpc === 'function') {
      ({ data, error = null } = await client.rpc('apply_issue_retest', { p_command: command }));
    } else {
      const { getPool } = await import('@/storage/database/pg-db');
      const result = await getPool().query<{ data: unknown }>(
        'SELECT apply_issue_retest($1::jsonb) AS data',
        [JSON.stringify(command)],
      );
      data = result.rows[0]?.data;
      error = null;
    }
    if (error) throw new Error(error.message || 'apply_issue_retest failed');
    if (!data || typeof data !== 'object') throw new Error('apply_issue_retest returned no data');
    const parsed = data as Partial<IssueRetestMutationResult>;
    if (!parsed.issue || typeof parsed.issue !== 'object') throw new Error('apply_issue_retest returned no issue');
    return parsed as IssueRetestMutationResult;
  } catch (error) {
    throw stableOperationError(error);
  }
}

export async function createIssueRetest(
  client: RpcClient,
  input: {
    issueId: string;
    description: string;
    result: EvaluationStatus;
    materialIds?: string[];
    createdBy: string;
  },
) {
  try {
    assertResult(input.result);
    return await callApplyIssueRetest(client, {
      action: 'create',
      issue_id: input.issueId,
      description: input.description.trim(),
      result: input.result,
      ...(input.materialIds !== undefined ? { material_ids: uniqueMaterialIds(input.materialIds) } : {}),
      created_by: input.createdBy,
    });
  } catch (error) {
    throw stableOperationError(error);
  }
}

export async function updateIssueRetest(
  client: RpcClient,
  reEvaluationId: string,
  input: { description?: string; result?: EvaluationStatus; materialIds?: string[] },
) {
  try {
    if (input.result !== undefined) assertResult(input.result);
    return await callApplyIssueRetest(client, {
      action: 'update',
      re_evaluation_id: reEvaluationId,
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.materialIds !== undefined ? { material_ids: uniqueMaterialIds(input.materialIds) } : {}),
    });
  } catch (error) {
    throw stableOperationError(error);
  }
}

export async function deleteIssueRetest(client: RpcClient, reEvaluationId: string) {
  try {
    return await callApplyIssueRetest(client, {
      action: 'delete',
      re_evaluation_id: reEvaluationId,
    });
  } catch (error) {
    throw stableOperationError(error);
  }
}
