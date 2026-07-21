/**
 * 问题整改状态机
 *
 * 权威状态只有四个：待整改、整改中、整改完成、不整改。旧八态只在读取
 * 边界被折叠为这四态，不再作为可写状态或 UI 状态出现。
 */

export type IssueStatus =
  | 'open'
  | 'rectifying'
  | 'verified_closed'
  | 'waived';

export type IssueTransition =
  | 'triage'
  | 'assign'
  | 'start_rectify'
  | 'submit_verification'
  | 'verify'
  | 'waive'
  | 'return_to_rectifying';

export type AuthRole =
  | 'executor'
  | 'task_owner'
  | 'rectification_owner'
  | 'product_manager'
  | 'reviewer'
  | 'executive_viewer'
  | 'admin'; // 兼容旧 admin，拥有所有转换权限

interface TransitionRule {
  from: IssueStatus[];
  to: IssueStatus;
  allowedRoles: AuthRole[];
  requiredFields?: string[];
}

const TRANSITIONS: Record<IssueTransition, TransitionRule> = {
  triage: {
    from: ['open', 'rectifying', 'verified_closed', 'waived'],
    to: 'open',
    allowedRoles: ['task_owner', 'product_manager', 'admin'],
  },
  assign: {
    from: ['open', 'rectifying'],
    to: 'rectifying',
    allowedRoles: ['task_owner', 'admin'],
    requiredFields: ['responsible_person'],
  },
  start_rectify: {
    from: ['open', 'rectifying', 'verified_closed', 'waived'],
    to: 'rectifying',
    allowedRoles: ['rectification_owner', 'task_owner', 'admin'],
  },
  submit_verification: {
    from: ['rectifying'],
    to: 'rectifying',
    allowedRoles: ['rectification_owner', 'task_owner', 'admin'],
    requiredFields: ['verification_note'],
  },
  return_to_rectifying: {
    from: ['open', 'rectifying', 'verified_closed', 'waived'],
    to: 'rectifying',
    allowedRoles: ['rectification_owner', 'task_owner', 'reviewer', 'admin'],
  },
  verify: {
    from: ['open', 'rectifying', 'verified_closed', 'waived'],
    to: 'verified_closed',
    allowedRoles: ['reviewer', 'task_owner', 'product_manager', 'admin'],
  },
  waive: {
    from: ['open', 'rectifying', 'verified_closed', 'waived'],
    to: 'waived',
    allowedRoles: ['task_owner', 'product_manager', 'admin'],
    requiredFields: ['no_improve_reason'],
  },
};

export const TERMINAL_STATUSES: IssueStatus[] = ['verified_closed', 'waived'];

export const LEGACY_STATUS_MAP: Record<string, IssueStatus> = {
  待整改: 'open',
  整改中: 'rectifying',
  已验证: 'verified_closed',
  已整改: 'verified_closed',
  整改完成: 'verified_closed',
  不整改: 'waived',
  // V4.0 active Chinese labels (UI dictionary) are also accepted as aliases.
  待分派: 'open',
  已分派: 'open',
  已指派: 'open',
  待验证: 'rectifying',
  已验证关闭: 'verified_closed',
  已重开: 'rectifying',
  triaged: 'open',
  assigned: 'open',
  pending_verification: 'rectifying',
  reopened: 'rectifying',
};

export function normalizeIssueStatus(status: string | null | undefined): IssueStatus {
  if (!status) return 'open';
  const normalized = LEGACY_STATUS_MAP[status] ?? status;
  const valid = (normalized as IssueStatus) ?? 'open';
  // Fallback to open if somehow invalid
  const allStatuses: IssueStatus[] = [
    'open',
    'rectifying',
    'verified_closed',
    'waived',
  ];
  return allStatuses.includes(valid) ? valid : 'open';
}

export type IssueStatusPresentationKey = 'pending' | 'rectifying' | 'waived' | 'rectified';

export interface IssueStatusPresentation {
  key: IssueStatusPresentationKey;
  label: '待整改' | '整改中' | '不整改' | '整改完成';
  className: string;
}

/**
 * Present the same four states that are persisted as canonical storage codes.
 */
export function getIssueStatusPresentation(status: string | null | undefined): IssueStatusPresentation {
  switch (normalizeIssueStatus(status)) {
    case 'verified_closed':
      return { key: 'rectified', label: '整改完成', className: 'text-emerald-600' };
    case 'waived':
      return { key: 'waived', label: '不整改', className: 'text-muted-foreground' };
    case 'open':
      return { key: 'pending', label: '待整改', className: 'text-foreground' };
    default:
      return { key: 'rectifying', label: '整改中', className: 'text-amber-600' };
  }
}

/** Convert the four visible states back to stable canonical storage codes. */
export function toStoredIssueStatus(status: string): IssueStatus {
  switch (status) {
    case '待整改':
    case 'pending':
      return 'open';
    case '整改中':
    case 'rectifying':
      return 'rectifying';
    case '不整改':
    case 'waived':
      return 'waived';
    case '已整改':
    case '整改完成':
    case 'rectified':
      return 'verified_closed';
    default:
      return normalizeIssueStatus(status);
  }
}

export function canTransition(
  currentStatus: IssueStatus,
  transition: IssueTransition,
  role: AuthRole,
): boolean {
  const rule = TRANSITIONS[transition];
  if (!rule) return false;
  return rule.from.includes(currentStatus) && rule.allowedRoles.includes(role);
}

export function getAvailableTransitions(
  currentStatus: IssueStatus,
  role: AuthRole,
): IssueTransition[] {
  return (Object.keys(TRANSITIONS) as IssueTransition[]).filter((t) =>
    canTransition(currentStatus, t, role),
  );
}

export function applyTransition(
  currentStatus: IssueStatus,
  transition: IssueTransition,
): IssueStatus {
  const rule = TRANSITIONS[transition];
  if (!rule || !rule.from.includes(currentStatus)) {
    throw new Error(`Invalid transition ${transition} from ${currentStatus}`);
  }
  return rule.to;
}

export class IssueStatusTransitionError extends Error {}

interface ResolveIssueStatusChangeInput {
  currentStatus: string | null | undefined;
  requestedStatus?: IssueStatus;
  transition?: string;
  role: AuthRole;
  fields?: Record<string, unknown>;
}

/** A status change must be the result of an explicit, authorized command. */
export function resolveIssueStatusChange({
  currentStatus,
  requestedStatus,
  transition,
  role,
  fields = {},
}: ResolveIssueStatusChangeInput): IssueStatus {
  const current = normalizeIssueStatus(currentStatus);
  if (!transition) {
    if (!requestedStatus || requestedStatus === current) return current;
    throw new IssueStatusTransitionError('An explicit transition command is required to change issue status');
  }
  if (!(transition in TRANSITIONS)) {
    throw new IssueStatusTransitionError(`Unknown issue transition: ${transition}`);
  }

  const command = transition as IssueTransition;
  if (!canTransition(current, command, role)) {
    throw new IssueStatusTransitionError(`Transition ${command} is not allowed from ${current}`);
  }
  const missing = getTransitionRequiredFields(command).filter((field) => {
    const value = fields[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    throw new IssueStatusTransitionError(`Transition ${command} requires: ${missing.join(', ')}`);
  }

  const next = applyTransition(current, command);
  if (requestedStatus && requestedStatus !== next) {
    throw new IssueStatusTransitionError(`Transition ${command} does not produce requested status ${requestedStatus}`);
  }
  return next;
}

export function getTransitionRequiredFields(transition: IssueTransition): string[] {
  return TRANSITIONS[transition]?.requiredFields ?? [];
}

export function isTerminalStatus(status: IssueStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
