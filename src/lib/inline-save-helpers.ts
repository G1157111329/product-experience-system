/**
 * inline-save-helpers — shared client helper for PATCH /api/v1/inline-values/*.
 *
 * PRD V3.1.2.4 §13.7 — 统一单字段内联保存端点。
 *
 * 与 InlineEditable 的 onSave 约定一致：
 *   - 409 → 返回 { conflict: true, serverVersion? }，由组件渲染冲突面板
 *   - 其它非 2xx → 抛错，组件状态切到 error
 *   - 成功 → 返回 { version? }
 */
import type { InlineSaveResult } from '@/components/inline-editable';

export interface PatchInlineOptions {
  /** Optimistic lock token (If-Match / body.ifMatch). */
  ifMatch?: string | number | null;
  /** Force overwrite after conflict (omit If-Match). */
  force?: boolean;
}

/**
 * 向统一内联保存端点 PATCH 单个字段。
 */
export async function patchInlineValue(
  entityType: string,
  entityId: string,
  fieldId: string,
  value: string,
  options?: PatchInlineOptions,
): Promise<InlineSaveResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const body: Record<string, unknown> = { value };
  if (!options?.force && options?.ifMatch != null && options.ifMatch !== '') {
    const token = String(options.ifMatch);
    headers['If-Match'] = token.includes('"') ? token : `"${token}"`;
    body.ifMatch = token.replace(/"/g, '');
  }

  const res = await fetch(
    `/api/v1/inline-values/${entityType}/${entityId}/${fieldId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    },
  );

  if (res.status === 409) {
    let serverVersion: string | number | undefined;
    try {
      const json = await res.json();
      serverVersion = json?.data?.serverVersion ?? json?.details?.serverVersion;
    } catch {
      // ignore
    }
    return { conflict: true, serverVersion };
  }
  if (!res.ok) throw new Error(`保存失败: ${res.status}`);

  try {
    const json = await res.json();
    const version = json?.data?.version;
    return version != null ? { version } : {};
  } catch {
    return {};
  }
}

/**
 * Upsert a V3 matrix cell via the dedicated cells API (preferred over inline
 * when the cell row may not exist yet).
 */
export async function putMatrixCellValue(opts: {
  matrixId: string;
  leafRowId: string;
  columnId: string;
  valueText?: string;
  valueNumber?: string | number | null;
}): Promise<{ id: string; version: number }> {
  const res = await fetch(
    `/api/v1/matrices/${opts.matrixId}/cells/${opts.leafRowId}/${opts.columnId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueText: opts.valueText,
        valueNumber: opts.valueNumber,
      }),
    },
  );
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '保存单元格失败');
  return { id: json.data.id, version: json.data.version };
}
