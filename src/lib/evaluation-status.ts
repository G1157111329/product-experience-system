export type EvaluationStatus = 'qualified' | 'unqualified' | 'pending';

const QUALIFIED_VALUES = new Set(['qualified', 'qualify', 'pass', 'passed', '合格']);
const UNQUALIFIED_VALUES = new Set(['unqualified', 'fail', 'failed', '不合格']);

export function normalizeEvaluationStatus(value: unknown): EvaluationStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (QUALIFIED_VALUES.has(normalized)) return 'qualified';
  if (UNQUALIFIED_VALUES.has(normalized)) return 'unqualified';
  return 'pending';
}

export function evaluationStatusLabel(value: unknown): '合格' | '不合格' | '待定' {
  const status = normalizeEvaluationStatus(value);
  if (status === 'qualified') return '合格';
  if (status === 'unqualified') return '不合格';
  return '待定';
}

export function evaluationRecipeSubjectName(name: unknown, recipeType: unknown): string {
  const subject = String(name ?? '').trim();
  const normalizedType = String(recipeType ?? '').trim().toLowerCase();
  const suffix = normalizedType === '功能' || normalizedType === 'function' ? '功能' : '食谱';
  return subject.endsWith('食谱') || subject.endsWith('功能') ? subject : `${subject}${suffix}`;
}

export function evaluationIssueTitle(
  subjectName: string,
  kind: 'recipe' | 'record',
  status: EvaluationStatus,
): string {
  const subject = subjectName.trim().slice(0, 180) || (kind === 'recipe' ? '未命名食谱/功能' : '未命名检查项');
  const suffix = kind === 'recipe' ? `效果${evaluationStatusLabel(status)}` : evaluationStatusLabel(status);
  return `${subject}${suffix}`.slice(0, 200);
}
