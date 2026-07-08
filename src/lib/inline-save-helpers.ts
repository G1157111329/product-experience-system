/**
 * inline-save-helpers — shared client helper for PATCH /api/v1/inline-values/*.
 *
 * PRD V3.1.2.4 §13.7 — 统一单字段内联保存端点。
 *
 * 与 InlineEditable 的 onSave 约定一致：
 *   - 409 → 返回 { conflict: true }，由组件渲染冲突提示
 *   - 其它非 2xx → 抛错，组件状态切到 error
 *   - 成功 → 返回 {}
 */
import type { InlineSaveResult } from '@/components/inline-editable';

/**
 * 向统一内联保存端点 PATCH 单个字段。
 *
 * @param entityType 实体类型，如 `function_effect_record` / `report_summary` / `comparison_matrix_cell`
 * @param entityId   实体 ID（recipe_id / task_id / cell_id）
 * @param fieldId    字段 ID，如 `effect_description` / `test_purpose` / `effect_summary`
 * @param value      新值
 */
export async function patchInlineValue(
  entityType: string,
  entityId: string,
  fieldId: string,
  value: string,
): Promise<InlineSaveResult> {
  const res = await fetch(
    `/api/v1/inline-values/${entityType}/${entityId}/${fieldId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  );
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new Error(`保存失败: ${res.status}`);
  return {};
}
