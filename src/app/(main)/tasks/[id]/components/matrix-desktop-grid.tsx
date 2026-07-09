'use client';

/**
 * Desktop Matrix Input Grid — PRD §5.4
 *
 * Renders the full matrix as a virtualized grid with:
 * - Group headers, row labels
 * - Editable cells for manual fields
 * - Read-only cells for calculated fields
 * - Evidence/issue slot cells
 * - Inline save with optimistic calc + error display
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ImagePlus, Plus, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type {
  MatrixReadProjectionV2,
  MatrixFieldDefinition,
  MatrixRowProjection,
  MatrixFieldValue,
  ValidationResult,
} from '@/lib/matrix/task-matrix-types';

interface DesktopMatrixGridProps {
  projection: MatrixReadProjectionV2;
  taskId: string;
  onRefresh: () => void;
}

export function DesktopMatrixGrid({ projection, taskId, onRefresh }: DesktopMatrixGridProps) {
  const { groups, designVersion, summary } = projection;
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Collect all row-scoped field definitions (visible in desktop grid)
  const gridFields = useMemo(() => {
    const fields: MatrixFieldDefinition[] = [];
    for (const section of designVersion.sections) {
      for (const f of section.fields) {
        if (f.scope === 'row' && f.showInDesktopGrid) {
          fields.push(f);
        }
      }
    }
    return fields;
  }, [designVersion]);

  const manualFields = gridFields.filter((f) => f.fieldKind === 'manual_value');
  const formulaFields = gridFields.filter((f) => f.fieldKind === 'formula');

  const validateMatrix = async () => {
    setValidating(true);
    try {
      const res = await fetch(`/api/matrices/${projection.matrix.id}/validate`, { method: 'POST' });
      const json = await res.json();
      if (json.code === 0) {
        setValidation(json.data);
        if (json.data?.passed) {
          toast.success('校验通过，矩阵链路已闭环');
        } else {
          toast.warning(`校验发现 ${json.data?.blockingItems?.length ?? 0} 个阻断项`);
        }
      } else {
        toast.error(json.message || '校验失败');
      }
    } catch {
      toast.error('校验失败，请稍后重试');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <span>共 {summary.totalRows} 条记录</span>
          <span>已完成 {summary.completedRows}</span>
          <span>证据 {summary.totalEvidence}</span>
          <span>问题 {summary.totalIssues}</span>
          {summary.anomalousRows > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" /> 异常 {summary.anomalousRows}
            </span>
          )}
          {summary.pendingIssueRows > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="h-3 w-3" /> 待补问题 {summary.pendingIssueRows}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={validateMatrix} disabled={validating}>
          {validating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ClipboardCheck className="mr-2 h-3 w-3" />}
          校验矩阵
        </Button>
      </div>

      <CreateGroupInline matrixId={projection.matrix.id} onRefresh={onRefresh} />

      {validation && (
        <Card className={validation.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
          <CardContent className="space-y-2 py-3 text-xs">
            <div className="font-medium">
              {validation.passed ? '校验通过' : `校验未通过：${validation.blockingItems.length} 个阻断项`}
            </div>
            {!validation.passed && validation.blockingItems.slice(0, 5).map((item) => (
              <div key={`${item.code}-${item.fieldId ?? item.rowId ?? item.message}`} className="text-amber-800">
                {item.code}：{item.message}
              </div>
            ))}
            {validation.warningItems.length > 0 && (
              <div className="text-muted-foreground">提示：{validation.warningItems.length} 个警示项</div>
            )}
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">暂无分组</p>
            <p className="mt-1 text-sm">先在上方添加一个分组，再继续添加记录行。</p>
          </CardContent>
        </Card>
      )}

      {/* Matrix grid */}
      {groups.length > 0 && <div className="overflow-x-auto border rounded-lg">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted sticky top-0 z-10">
              <th className="border p-2 text-left w-32 sticky left-0 bg-muted z-20">
                {projection.matrix.name}
              </th>
              <th className="border p-2 text-left w-40">行</th>
              {gridFields.map((f) => (
                <th key={f.id} className="border p-2 text-left min-w-[100px] max-w-[200px]">
                  <div className="flex items-center gap-1">
                    <span className="truncate" title={f.label}>{f.label}</span>
                    {f.requiredMode === 'required' && <span className="text-red-500">*</span>}
                  </div>
                  {f.unitText && <span className="text-[10px] text-muted-foreground">({f.unitText})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <MatrixGroupRows
                key={group.id}
                group={group}
                gridFields={gridFields}
                manualFields={manualFields}
                formulaFields={formulaFields}
                taskId={taskId}
                onRefresh={onRefresh}
              />
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

function CreateGroupInline({ matrixId, onRefresh }: { matrixId: string; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const createGroup = async () => {
    const groupLabel = name.trim();
    if (!groupLabel) {
      toast.info('请输入分组名称');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/matrices/${matrixId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupLabel }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('分组已添加');
        setName('');
        onRefresh();
      } else {
        toast.error(json.message || '分组添加失败');
      }
    } catch {
      toast.error('分组添加失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); }}
          placeholder="添加分组，如：食材 A / 样机 A"
          className="h-9"
        />
        <Button onClick={createGroup} disabled={saving} className="md:w-32">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          添加分组
        </Button>
      </CardContent>
    </Card>
  );
}

function MatrixGroupRows({
  group,
  gridFields,
  manualFields,
  formulaFields,
  taskId,
  onRefresh,
}: {
  group: { id: string; groupLabel: string; rows: MatrixRowProjection[] };
  gridFields: MatrixFieldDefinition[];
  manualFields: MatrixFieldDefinition[];
  formulaFields: MatrixFieldDefinition[];
  taskId: string;
  onRefresh: () => void;
}) {
  return (
    <>
      {group.rows.length === 0 && (
        <tr>
          <td className="border p-2 font-medium bg-muted/50 sticky left-0 z-10">{group.groupLabel}</td>
          <td className="border p-2" colSpan={gridFields.length + 1}>
            <CreateRowInline groupId={group.id} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
      {group.rows.map((row, rowIdx) => (
        <tr key={row.id} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-muted/30'}>
          {/* Group label — only on first row of group */}
          {rowIdx === 0 && (
            <td
              className="border p-2 font-medium bg-muted/50 sticky left-0 z-10"
              rowSpan={group.rows.length + 1}
            >
              {group.groupLabel}
            </td>
          )}
          <td className="border p-2 font-medium">
            <div className="flex items-center gap-1">
              <span>{row.rowLabel}</span>
              {row.completionStatus === 'completed' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
              {row.hasCalculationFailures && <AlertTriangle className="h-3 w-3 text-amber-500" />}
              {row.hasMissingRequired && <AlertTriangle className="h-3 w-3 text-red-500" />}
            </div>
          </td>
          {gridFields.map((field) => (
            <MatrixCell
              key={field.id}
              row={row}
              field={field}
              taskId={taskId}
              onRefresh={onRefresh}
            />
          ))}
        </tr>
      ))}
      {group.rows.length > 0 && (
        <tr className="bg-muted/20">
          <td className="border p-2" colSpan={gridFields.length + 1}>
            <CreateRowInline groupId={group.id} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

function CreateRowInline({ groupId, onRefresh }: { groupId: string; onRefresh: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const createRow = async () => {
    const rowLabel = name.trim();
    if (!rowLabel) {
      toast.info('请输入行名称');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/matrix-groups/${groupId}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowLabel }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('记录行已添加');
        setName('');
        onRefresh();
      } else {
        toast.error(json.message || '记录行添加失败');
      }
    } catch {
      toast.error('记录行添加失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-lg items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') createRow(); }}
        placeholder="添加行，如：口径 1 / 批次 1"
        className="h-8 text-xs"
      />
      <Button size="sm" variant="outline" onClick={createRow} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
        添加行
      </Button>
    </div>
  );
}

function MatrixCell({
  row,
  field,
  taskId,
  onRefresh,
}: {
  row: MatrixRowProjection;
  field: MatrixFieldDefinition;
  taskId: string;
  onRefresh: () => void;
}) {
  const value = row.values[field.id];
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Initialize draft from value
  useEffect(() => {
    if (value?.numericValue != null) setDraft(String(value.numericValue));
    else if (value?.textValue != null) setDraft(value.textValue);
    else if (value?.durationMs != null) setDraft(formatDuration(value.durationMs));
    else if (value?.enumValue != null) setDraft(value.enumValue);
    else if (value?.booleanValue != null) setDraft(value.booleanValue ? '是' : '否');
    else setDraft('');
  }, [value]);

  const save = useCallback(async (newDraft: string) => {
    setSaving(true);
    setError(null);
    try {
      let body: Record<string, unknown> = { rowVersion: row.version };

      if (!newDraft || newDraft === '') {
        body.valueState = 'missing';
      } else if (field.dataType === 'number' || field.dataType === 'percentage') {
        const n = parseFloat(newDraft);
        if (isNaN(n)) { setError('请输入有效数值'); setSaving(false); return; }
        body.numericValue = n;
        body.valueState = 'filled';
      } else if (field.dataType === 'duration') {
        const ms = parseDuration(newDraft);
        body.durationMs = ms;
        body.valueState = 'filled';
      } else if (field.dataType === 'boolean') {
        body.booleanValue = newDraft === '是' || newDraft === 'true';
        body.valueState = 'filled';
      } else if (field.dataType === 'single_select') {
        body.enumValue = newDraft;
        body.valueState = 'filled';
      } else {
        body.textValue = newDraft;
        body.valueState = 'filled';
      }

      const res = await fetch(`/api/matrix-rows/${row.id}/values/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.code === 0) {
        onRefresh();
      } else {
        setError(json.message);
      }
    } catch {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  }, [row.id, row.version, field, onRefresh]);

  // Auto-save on 800ms debounce
  const schedule = useCallback((val: string) => {
    setDraft(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(val), 800);
  }, [save]);

  const handleBlur = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    save(draft);
  }, [draft, save]);

  // Calculated field — read only
  if (field.fieldKind === 'formula') {
    let display = '—';
    let isError = false;
    if (value?.valueState === 'calculation_failed') {
      display = value.errorCode ?? '计算失败';
      isError = true;
    } else if (value?.numericValue != null) {
      const n = Number(value.numericValue);
      display = n.toFixed(field.decimalPlaces ?? 1);
      if (field.unitText) display += ` ${field.unitText}`;
    } else if (value?.valueState === 'pending_input') {
      display = '待补充';
    }

    return (
      <td className={`border p-1 ${isError ? 'bg-red-50' : 'bg-muted/20'}`}>
        <div className={`text-xs px-2 py-1 ${isError ? 'text-red-600' : 'text-muted-foreground'} truncate`}>
          {display}
        </div>
      </td>
    );
  }

  // Evidence slot
  if (field.fieldKind === 'evidence_slot') {
    return (
      <td className="border p-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[10px]"
          onClick={() => {
            const next = window.prompt('请输入证据说明或素材编号', value?.textValue ?? '');
            if (next !== null) save(next.trim());
          }}
        >
          <ImagePlus className="h-3 w-3" />
          证据 {row.evidenceCounts[field.id] ?? 0}
        </Button>
        {value?.textValue && <div className="mt-1 max-w-[160px] truncate text-[10px] text-muted-foreground">{value.textValue}</div>}
      </td>
    );
  }

  // Issue slot
  if (field.fieldKind === 'issue_slot') {
    return (
      <td className="border p-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[10px]"
          onClick={() => {
            const next = window.prompt('请输入问题描述', value?.textValue ?? '');
            if (next !== null) save(next.trim());
          }}
        >
          <AlertTriangle className="h-3 w-3" />
          问题 {row.issueCounts[field.id] ?? 0}
        </Button>
        {value?.textValue && <div className="mt-1 max-w-[160px] truncate text-[10px] text-amber-700">{value.textValue}</div>}
      </td>
    );
  }

  // Editable cell
  const errorClass = error ? 'bg-red-50' : value?.valueState === 'calculation_failed' ? 'bg-amber-50' : '';

  return (
    <td className={`border p-1 ${errorClass}`}>
      <div className="flex items-center gap-1">
        <Input
          className="h-7 min-w-[80px] text-xs"
          value={draft}
          onChange={(e) => schedule(e.target.value)}
          onBlur={handleBlur}
          placeholder="—"
          disabled={saving}
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseDuration(input: string): number {
  // Support: "32s", "3:32", "3m32s"
  const mmss = input.match(/^(\d+):(\d+)$/);
  if (mmss) return (parseInt(mmss[1]) * 60 + parseInt(mmss[2])) * 1000;
  const mms = input.match(/^(\d+)m(\d+)s?$/);
  if (mms) return (parseInt(mms[1]) * 60 + parseInt(mms[2])) * 1000;
  const sec = input.match(/^(\d+)s?$/);
  if (sec) return parseInt(sec[1]) * 1000;
  return 0;
}
