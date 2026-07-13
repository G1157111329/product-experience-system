/**
 * V3.1.1 §27.2.6 — Pure types and frozen defaults for dictionaries.
 *
 * Safe to import from both server and client code. No DB / Drizzle imports here.
 * The server-side loader lives in `@/lib/server/dictionaries`; the client hook
 * lives in `@/hooks/useDictionary`.
 */

export const DICT_TYPES = [
  "project_phase_dict",
  "issue_status_dict",
  "task_status_dict",
  "report_status_dict",
  "issue_severity_dict",
  "sla_policy_dict",
] as const;

export type DictType = (typeof DICT_TYPES)[number];

export type DictItem = {
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  scopeFilter?: unknown;
  description?: string | null;
};

export type DictMap = Record<DictType, DictItem[]>;

/**
 * Frozen fallback values. Ported verbatim from the existing hardcoded constant
 * sets to guarantee UI keeps working when the dictionary table is empty or the
 * DB is unreachable. Do NOT edit without bumping the version and migrating rows.
 */
export const defaultDict: DictMap = {
  project_phase_dict: [
    { code: "手板", label: "手板", sortOrder: 10, isActive: true },
    { code: "试制", label: "试制", sortOrder: 20, isActive: true },
    { code: "试产", label: "试产", sortOrder: 30, isActive: true },
    { code: "量产", label: "量产", sortOrder: 40, isActive: true },
    { code: "手板研究", label: "手板研究", sortOrder: 11, isActive: true, description: "兼容旧值" },
    { code: "试制阶段", label: "试制阶段", sortOrder: 21, isActive: true, description: "兼容旧值" },
    { code: "试产阶段", label: "试产阶段", sortOrder: 31, isActive: true, description: "兼容旧值" },
    { code: "量产阶段", label: "量产阶段", sortOrder: 41, isActive: true, description: "兼容旧值" },
  ],
  issue_status_dict: [
    { code: "open", label: "待整改", sortOrder: 10, isActive: true },
    { code: "rectifying", label: "整改中", sortOrder: 20, isActive: true },
    { code: "verified_closed", label: "整改完成", sortOrder: 30, isActive: true },
    { code: "waived", label: "不整改", sortOrder: 40, isActive: true },
  ],
  task_status_dict: [
    { code: "待执行", label: "待执行", sortOrder: 10, isActive: true },
    { code: "进行中", label: "进行中", sortOrder: 20, isActive: true },
    { code: "已完成", label: "已完成", sortOrder: 30, isActive: true },
    { code: "已取消", label: "已取消", sortOrder: 40, isActive: true },
  ],
  report_status_dict: [
    { code: "草稿", label: "草稿", sortOrder: 10, isActive: true },
    { code: "待审核", label: "待审核", sortOrder: 20, isActive: true },
    { code: "已发布", label: "已发布", sortOrder: 30, isActive: true },
    { code: "已归档", label: "已归档", sortOrder: 40, isActive: true },
  ],
  issue_severity_dict: [
    { code: "一类", label: "一类", sortOrder: 10, isActive: true },
    { code: "二类", label: "二类", sortOrder: 20, isActive: true },
    { code: "三类", label: "三类", sortOrder: 30, isActive: true },
  ],
  sla_policy_dict: [],
};

export function isDictType(value: string): value is DictType {
  return (DICT_TYPES as readonly string[]).includes(value);
}
