/**
 * PRD V4.0 问题状态机
 *
 * 8 态：
 *   open → triaged → assigned → rectifying → pending_verification → verified_closed
 *   任意非终态 ──► waived
 *   verified_closed / waived ──► reopened
 *   reopened 可重新进入 triaged / assigned / rectifying
 *
 * 状态转换由角色 + 当前状态共同决定，转换时可校验必填字段。
 */

export type IssueStatus =
  | 'open'
  | 'triaged'
  | 'assigned'
  | 'rectifying'
  | 'pending_verification'
  | 'verified_closed'
  | 'waived'
  | 'reopened';

export type IssueTransition =
  | 'triage'
  | 'assign'
  | 'start_rectify'
  | 'submit_verification'
  | 'verify'
  | 'waive'
  | 'reopen'
  | 'return_to_rectifying'; // 复测失败，从 pending_verification 回到 rectifying

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
    from: ['open', 'reopened'],
    to: 'triaged',
    allowedRoles: ['task_owner', 'product_manager', 'admin'],
  },
  assign: {
    from: ['triaged', 'reopened'],
    to: 'assigned',
    allowedRoles: ['task_owner', 'admin'],
    requiredFields: ['responsible_person'],
  },
  start_rectify: {
    from: ['assigned', 'reopened'],
    to: 'rectifying',
    allowedRoles: ['rectification_owner', 'task_owner', 'admin'],
  },
  submit_verification: {
    from: ['rectifying'],
    to: 'pending_verification',
    allowedRoles: ['rectification_owner', 'task_owner', 'admin'],
    requiredFields: ['verification_note'],
  },
  return_to_rectifying: {
    from: ['pending_verification'],
    to: 'rectifying',
    allowedRoles: ['rectification_owner', 'task_owner', 'reviewer', 'admin'],
  },
  verify: {
    from: ['pending_verification'],
    to: 'verified_closed',
    allowedRoles: ['reviewer', 'task_owner', 'product_manager', 'admin'],
  },
  waive: {
    from: ['open', 'triaged', 'assigned', 'rectifying', 'pending_verification', 'reopened'],
    to: 'waived',
    allowedRoles: ['task_owner', 'product_manager', 'admin'],
    requiredFields: ['no_improve_reason'],
  },
  reopen: {
    from: ['verified_closed', 'waived'],
    to: 'reopened',
    allowedRoles: ['task_owner', 'product_manager', 'reviewer', 'admin'],
  },
};

export const TERMINAL_STATUSES: IssueStatus[] = ['verified_closed', 'waived'];

export const LEGACY_STATUS_MAP: Record<string, IssueStatus> = {
  待整改: 'open',
  整改中: 'rectifying',
  已验证: 'verified_closed',
  不整改: 'waived',
  // V4.0 active Chinese labels (UI dictionary) are also accepted as aliases.
  待分派: 'open',
  已分派: 'triaged',
  已指派: 'assigned',
  待验证: 'pending_verification',
  已验证关闭: 'verified_closed',
  已重开: 'reopened',
};

export function normalizeIssueStatus(status: string | null | undefined): IssueStatus {
  if (!status) return 'open';
  const normalized = LEGACY_STATUS_MAP[status] ?? status;
  const valid = (normalized as IssueStatus) ?? 'open';
  // Fallback to open if somehow invalid
  const allStatuses: IssueStatus[] = [
    'open',
    'triaged',
    'assigned',
    'rectifying',
    'pending_verification',
    'verified_closed',
    'waived',
    'reopened',
  ];
  return allStatuses.includes(valid) ? valid : 'open';
}

export type IssueStatusPresentationKey = 'pending' | 'rectifying' | 'waived' | 'rectified';

export interface IssueStatusPresentation {
  key: IssueStatusPresentationKey;
  label: '待整改' | '整改中' | '不整改' | '已整改';
  className: string;
}

/**
 * Keep the richer historical lifecycle in storage while presenting the four
 * business states used by experience engineers throughout the UI.
 */
export function getIssueStatusPresentation(status: string | null | undefined): IssueStatusPresentation {
  switch (normalizeIssueStatus(status)) {
    case 'verified_closed':
      return { key: 'rectified', label: '已整改', className: 'text-emerald-600' };
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

export function getTransitionRequiredFields(transition: IssueTransition): string[] {
  return TRANSITIONS[transition]?.requiredFields ?? [];
}

export function isTerminalStatus(status: IssueStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
