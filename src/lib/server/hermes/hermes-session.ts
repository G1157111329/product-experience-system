/**
 * Hermes dual-mode session contract (wizard default + numeric shortcuts).
 *
 * Timers:
 * - 2h idle → unbind current experience task from the chat
 * - Media list reselect ONLY after timeout unbind (or never-bound); not on every media send
 */

export const HERMES_IDLE_UNBIND_MS = 2 * 60 * 60 * 1000;
/** Optional sticky-section soft expiry inside a still-bound task (does not unbind). */
export const HERMES_SECTION_STALE_MS = 60 * 60 * 1000;

export type HermesBindMode =
  | 'awaiting_task_pick'
  | 'bound'
  | 'unbound_recording';

export type HermesSectionCode = 1 | 2 | 3 | 4;

export type HermesSessionState = {
  version: 1;
  bindMode: HermesBindMode;
  taskId: string | null;
  /** 1 五感 / 2 食谱 / 3 对比 / 4 数据；null = 仅任务素材库 */
  section: HermesSectionCode | null;
  /** 食谱序号（1-based），对应 21/22… */
  recipeIndex: number | null;
  /** 对比：对象序号、细项序号（1-based），对应 31 / 311 */
  comparisonObjectIndex: number | null;
  comparisonItemIndex: number | null;
  /** 数据矩阵：一级大类、二级细项（1-based），对应 41 / 411 */
  matrixCategoryIndex: number | null;
  matrixLeafIndex: number | null;
  lastUserActivityAt: string;
  /** 超时解绑后、尚未完成列表重选前的待归位素材 */
  pendingMediaIds: string[];
  /** 是否因空闲超时而解绑（下一次发媒体必须列表重选） */
  unboundByIdleTimeout: boolean;
};

export type HermesNavCode =
  | { kind: 'section'; section: HermesSectionCode }
  | { kind: 'recipe'; recipeIndex: number }
  | { kind: 'comparison_object'; objectIndex: number }
  | { kind: 'comparison_cell'; objectIndex: number; itemIndex: number }
  | { kind: 'matrix_category'; categoryIndex: number }
  | { kind: 'matrix_leaf'; categoryIndex: number; leafIndex: number }
  | { kind: 'task_pick'; index: number }
  | { kind: 'decline_bind' }
  | { kind: 'none' };

export function defaultHermesSession(now = new Date()): HermesSessionState {
  return {
    version: 1,
    bindMode: 'awaiting_task_pick',
    taskId: null,
    section: null,
    recipeIndex: null,
    comparisonObjectIndex: null,
    comparisonItemIndex: null,
    matrixCategoryIndex: null,
    matrixLeafIndex: null,
    lastUserActivityAt: now.toISOString(),
    pendingMediaIds: [],
    unboundByIdleTimeout: false,
  };
}

export function parseHermesSession(raw: unknown, now = new Date()): HermesSessionState {
  const base = defaultHermesSession(now);
  if (!raw || typeof raw !== 'object') return base;
  const row = raw as Record<string, unknown>;
  const section = Number(row.section);
  return {
    ...base,
    bindMode: row.bindMode === 'bound' || row.bindMode === 'unbound_recording' || row.bindMode === 'awaiting_task_pick'
      ? row.bindMode
      : base.bindMode,
    taskId: typeof row.taskId === 'string' ? row.taskId : null,
    section: section === 1 || section === 2 || section === 3 || section === 4 ? section : null,
    recipeIndex: positiveInt(row.recipeIndex),
    comparisonObjectIndex: positiveInt(row.comparisonObjectIndex),
    comparisonItemIndex: positiveInt(row.comparisonItemIndex),
    matrixCategoryIndex: positiveInt(row.matrixCategoryIndex),
    matrixLeafIndex: positiveInt(row.matrixLeafIndex),
    lastUserActivityAt: typeof row.lastUserActivityAt === 'string' ? row.lastUserActivityAt : base.lastUserActivityAt,
    pendingMediaIds: Array.isArray(row.pendingMediaIds)
      ? row.pendingMediaIds.map((id) => String(id)).filter(Boolean).slice(0, 40)
      : [],
    unboundByIdleTimeout: row.unboundByIdleTimeout === true,
  };
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function msSinceActivity(session: HermesSessionState, now = new Date()): number {
  const last = Date.parse(session.lastUserActivityAt);
  if (!Number.isFinite(last)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.getTime() - last);
}

/** 2h idle → unbind task; clear sticky section; mark unboundByIdleTimeout for media reselect. */
export function applyIdleUnbind(session: HermesSessionState, now = new Date()): HermesSessionState {
  if (session.bindMode !== 'bound' || !session.taskId) return session;
  if (msSinceActivity(session, now) < HERMES_IDLE_UNBIND_MS) return session;
  return {
    ...session,
    bindMode: 'awaiting_task_pick',
    taskId: null,
    section: null,
    recipeIndex: null,
    comparisonObjectIndex: null,
    comparisonItemIndex: null,
    matrixCategoryIndex: null,
    matrixLeafIndex: null,
    unboundByIdleTimeout: true,
  };
}

/**
 * Media must go through real list reselection ONLY after idle timeout unbind
 * (or never-bound awaiting pick) — not on every media send during active binding.
 */
export function requiresMediaListReselect(session: HermesSessionState, hasMedia: boolean): boolean {
  if (!hasMedia) return false;
  if (session.bindMode === 'awaiting_task_pick') return true;
  if (session.unboundByIdleTimeout && !session.taskId) return true;
  return false;
}

/** Within a bound session, sticky section older than 1h is cleared but task stays bound. */
export function applySectionStale(session: HermesSessionState, now = new Date()): HermesSessionState {
  if (session.bindMode !== 'bound' || !session.taskId) return session;
  if (msSinceActivity(session, now) < HERMES_SECTION_STALE_MS) return session;
  return {
    ...session,
    section: null,
    recipeIndex: null,
    comparisonObjectIndex: null,
    comparisonItemIndex: null,
    matrixCategoryIndex: null,
    matrixLeafIndex: null,
  };
}

export function touchHermesSession(session: HermesSessionState, now = new Date()): HermesSessionState {
  return { ...session, lastUserActivityAt: now.toISOString() };
}

/** Parse wizard/numeric codes. Task pick `1`..`N` is handled by caller when awaiting_task_pick. */
export function parseHermesNavCode(content: string): HermesNavCode {
  const text = content.trim();
  if (!text) return { kind: 'none' };
  if (/^(不绑定|暂不绑定|跳过绑定|无绑定)([！!。.\s]*)$/u.test(text)) {
    return { kind: 'decline_bind' };
  }
  if (/^[1-4]$/.test(text)) {
    return { kind: 'section', section: Number(text) as HermesSectionCode };
  }
  const recipe = text.match(/^2([1-9]\d?)$/);
  if (recipe) return { kind: 'recipe', recipeIndex: Number(recipe[1]) };
  const comparisonCell = text.match(/^3([1-9]\d?)([1-9]\d?)$/);
  if (comparisonCell) {
    return {
      kind: 'comparison_cell',
      objectIndex: Number(comparisonCell[1]),
      itemIndex: Number(comparisonCell[2]),
    };
  }
  const comparisonObject = text.match(/^3([1-9]\d?)$/);
  if (comparisonObject) {
    return { kind: 'comparison_object', objectIndex: Number(comparisonObject[1]) };
  }
  const matrixLeaf = text.match(/^4([1-9]\d?)([1-9]\d?)$/);
  if (matrixLeaf) {
    return {
      kind: 'matrix_leaf',
      categoryIndex: Number(matrixLeaf[1]),
      leafIndex: Number(matrixLeaf[2]),
    };
  }
  const matrixCategory = text.match(/^4([1-9]\d?)$/);
  if (matrixCategory) {
    return { kind: 'matrix_category', categoryIndex: Number(matrixCategory[1]) };
  }
  if (/^[1-9]\d*$/.test(text)) {
    return { kind: 'task_pick', index: Number(text) };
  }
  return { kind: 'none' };
}

export function formatTaskPickPrompt(tasks: Array<{ taskName: string }>): string {
  if (tasks.length === 0) {
    return [
      '当前没有进行中的体验计划。',
      '回复「新建任务：名称」创建，或回复「不绑定」进入无绑定记录模式（文字/图片/视频仍会保留在本对话，素材先入个人收件箱）。',
    ].join('\n');
  }
  const rows = tasks.map((task, index) => `${index + 1}. ${task.taskName}`);
  return [
    '请选择要绑定的进行中体验计划（向导默认）：',
    ...rows,
    '',
    '回复序号绑定；回复「不绑定」进入无绑定记录模式。',
    '绑定后可用：1五感 2食谱/功能 3对比矩阵 4数据矩阵；或直接发图进入当前上下文（未超时不重选列表）。',
  ].join('\n');
}

export function formatSectionWizardPrompt(taskName: string): string {
  return [
    `已绑定体验计划「${taskName}」。`,
    '请选择录入板块（向导默认，也可直接发数字码）：',
    '1. 五感体验',
    '2. 食谱/功能',
    '3. 对比矩阵',
    '4. 数据矩阵',
    '',
    '若不选板块直接发图/视频：写入该体验计划素材库并按上传时间排序命名。',
    '2小时无连续录入将自动解绑；超时后再发媒体才会重新弹出列表供选择。',
  ].join('\n');
}

export function formatRecipeListPrompt(rows: Array<{ name: string }>): string {
  if (rows.length === 0) {
    return '当前体验计划还没有食谱/功能。可直接发图进入任务素材库，或在平台新建食谱后再用 21/22… 选择。';
  }
  return [
    '食谱/功能列表（回复 21=第1条，22=第2条…）：',
    ...rows.map((row, index) => `${index + 1}. ${row.name}`),
    '',
    '也可回复 2 重新查看本列表。',
  ].join('\n');
}

export function formatComparisonListPrompt(input: {
  objects: Array<{ name: string }>;
  items: Array<{ label: string }>;
}): string {
  if (input.objects.length === 0 && input.items.length === 0) {
    return '当前体验计划还没有对比矩阵对象/细项。可直接发图进入任务素材库，或在平台先建对比矩阵。';
  }
  return [
    '对比矩阵（回复 31=对象1，311=对象1+细项1）：',
    '对象：',
    ...(input.objects.length
      ? input.objects.map((row, index) => `  ${index + 1}. ${row.name}`)
      : ['  （暂无）']),
    '细项：',
    ...(input.items.length
      ? input.items.map((row, index) => `  ${index + 1}. ${row.label}`)
      : ['  （暂无）']),
  ].join('\n');
}

export function formatMatrixListPrompt(input: {
  categories: Array<{ label: string }>;
  leaves: Array<{ label: string }>;
}): string {
  if (input.categories.length === 0 && input.leaves.length === 0) {
    return '当前体验计划还没有数据矩阵。可直接发图进入任务素材库，或在平台先建数据矩阵。';
  }
  return [
    '数据矩阵（回复 41=大类1，411=大类1+细项1）：',
    '一级大类：',
    ...(input.categories.length
      ? input.categories.map((row, index) => `  ${index + 1}. ${row.label}`)
      : ['  （暂无）']),
    '二级细项：',
    ...(input.leaves.length
      ? input.leaves.map((row, index) => `  ${index + 1}. ${row.label}`)
      : ['  （暂无）']),
  ].join('\n');
}

export function describeHermesContext(session: HermesSessionState, taskName?: string | null): string {
  if (session.bindMode === 'unbound_recording') return '当前：无绑定记录模式';
  if (session.bindMode !== 'bound' || !session.taskId) return '当前：未绑定体验计划';
  const parts = [`当前：${taskName || session.taskId}`];
  if (session.section === 1) parts.push('板块：五感体验');
  if (session.section === 2) {
    parts.push(session.recipeIndex ? `板块：食谱/功能 #${session.recipeIndex}` : '板块：食谱/功能');
  }
  if (session.section === 3) {
    if (session.comparisonObjectIndex && session.comparisonItemIndex) {
      parts.push(`板块：对比 对象${session.comparisonObjectIndex}/细项${session.comparisonItemIndex}`);
    } else if (session.comparisonObjectIndex) {
      parts.push(`板块：对比 对象${session.comparisonObjectIndex}`);
    } else {
      parts.push('板块：对比矩阵');
    }
  }
  if (session.section === 4) {
    if (session.matrixCategoryIndex && session.matrixLeafIndex) {
      parts.push(`板块：数据矩阵 大类${session.matrixCategoryIndex}/细项${session.matrixLeafIndex}`);
    } else if (session.matrixCategoryIndex) {
      parts.push(`板块：数据矩阵 大类${session.matrixCategoryIndex}`);
    } else {
      parts.push('板块：数据矩阵');
    }
  }
  if (!session.section) parts.push('板块：未选（素材进任务库）');
  return parts.join(' · ');
}
