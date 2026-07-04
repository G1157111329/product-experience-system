/**
 * PRD V4.0 角色权限模型（RBAC）
 *
 * 6 种业务角色：
 *   executor            体验承接人
 *   task_owner          任务负责人
 *   rectification_owner 研发整改负责人
 *   product_manager     产品决策者
 *   reviewer            审核发布人
 *   executive_viewer    管理层读者
 *
 * 旧 admin 角色映射为拥有所有权限的超级管理员。
 */

export type AuthRole =
  | 'admin'
  | 'executor'
  | 'task_owner'
  | 'rectification_owner'
  | 'product_manager'
  | 'reviewer'
  | 'executive_viewer';

export const APP_ROLES: AuthRole[] = [
  'executor',
  'task_owner',
  'rectification_owner',
  'product_manager',
  'reviewer',
  'executive_viewer',
];

export const Permission = {
  // 任务
  TASK_CREATE: 'task:create',
  TASK_EDIT: 'task:edit',
  TASK_EDIT_ALL: 'task:edit_all',
  TASK_TRANSFER: 'task:transfer',
  TASK_CLOSE: 'task:close',
  TASK_VIEW_ALL: 'task:view_all',

  // 报告
  REPORT_CREATE: 'report:create',
  REPORT_REVIEW: 'report:review',
  REPORT_PUBLISH: 'report:publish',
  REPORT_VIEW_ALL: 'report:view_all',

  // 问题
  ISSUE_CREATE: 'issue:create',
  ISSUE_TRIAGE: 'issue:triage',
  ISSUE_ASSIGN: 'issue:assign',
  ISSUE_RECTIFY: 'issue:rectify',
  ISSUE_VERIFY: 'issue:verify',
  ISSUE_WAIVE: 'issue:waive',
  ISSUE_REOPEN: 'issue:reopen',
  ISSUE_VIEW_ALL: 'issue:view_all',

  // 素材
  EVIDENCE_CREATE: 'evidence:create',
  EVIDENCE_VIEW_ALL: 'evidence:view_all',

  // 系统
  SYSTEM_ADMIN: 'system:admin',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

const ROLE_PERMISSIONS: Record<Exclude<AuthRole, 'admin'>, Set<Permission>> = {
  executor: new Set([
    Permission.TASK_CREATE,
    Permission.TASK_EDIT,
    Permission.REPORT_CREATE,
    Permission.ISSUE_CREATE,
    Permission.EVIDENCE_CREATE,
  ]),

  task_owner: new Set([
    Permission.TASK_CREATE,
    Permission.TASK_EDIT,
    Permission.TASK_EDIT_ALL,
    Permission.TASK_TRANSFER,
    Permission.TASK_CLOSE,
    Permission.TASK_VIEW_ALL,
    Permission.REPORT_CREATE,
    Permission.REPORT_PUBLISH,
    Permission.ISSUE_CREATE,
    Permission.ISSUE_TRIAGE,
    Permission.ISSUE_ASSIGN,
    Permission.ISSUE_WAIVE,
    Permission.ISSUE_REOPEN,
    Permission.ISSUE_VERIFY,
    Permission.EVIDENCE_CREATE,
    Permission.EVIDENCE_VIEW_ALL,
  ]),

  rectification_owner: new Set([
    Permission.ISSUE_RECTIFY,
    Permission.ISSUE_VERIFY,
    Permission.EVIDENCE_CREATE,
  ]),

  product_manager: new Set([
    Permission.TASK_VIEW_ALL,
    Permission.REPORT_VIEW_ALL,
    Permission.REPORT_REVIEW,
    Permission.ISSUE_VIEW_ALL,
    Permission.ISSUE_TRIAGE,
    Permission.ISSUE_ASSIGN,
    Permission.ISSUE_VERIFY,
    Permission.ISSUE_WAIVE,
    Permission.ISSUE_REOPEN,
  ]),

  reviewer: new Set([
    Permission.TASK_VIEW_ALL,
    Permission.REPORT_VIEW_ALL,
    Permission.REPORT_REVIEW,
    Permission.REPORT_PUBLISH,
    Permission.ISSUE_VIEW_ALL,
    Permission.ISSUE_VERIFY,
    Permission.ISSUE_REOPEN,
  ]),

  executive_viewer: new Set([
    Permission.TASK_VIEW_ALL,
    Permission.REPORT_VIEW_ALL,
    Permission.ISSUE_VIEW_ALL,
    Permission.EVIDENCE_VIEW_ALL,
  ]),
};

export function hasPermission(role: AuthRole, permission: Permission): boolean {
  if (role === 'admin') return true;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function hasAnyPermission(role: AuthRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: AuthRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function getRolePermissions(role: AuthRole): Permission[] {
  if (role === 'admin') return [...ALL_PERMISSIONS];
  return [...(ROLE_PERMISSIONS[role] ?? new Set())];
}

export function isValidRole(role: string): role is AuthRole {
  return role === 'admin' || APP_ROLES.includes(role as Exclude<AuthRole, 'admin'>);
}

// 旧 user 角色迁移时的默认建议角色
export function suggestRoleForLegacyUser(isAdmin: boolean): AuthRole {
  return isAdmin ? 'product_manager' : 'executor';
}
