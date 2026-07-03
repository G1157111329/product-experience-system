'use client';

/**
 * RecordContextBar — a sticky single/double-row context strip that mirrors the
 * object / 食材 / 条件 / 类目 of the currently focused matrix row.
 *
 * Per spec §27.3 UI-04 this is NOT a material panel — it is a lightweight
 * context reminder so the user always knows which record they are editing.
 * It derives everything from the `focusedRow`'s subject + slots.
 */
import { Table2 } from 'lucide-react';
import type { MatrixReadRow } from '@/lib/matrix/projection';
import { RESULT_STATUS_OPTIONS } from './matrix-cell';

interface RecordContextBarProps {
  /** The row the user last focused/edited, or null when none. */
  focusedRow: MatrixReadRow | null;
  /** Optional schema name to lead the bar with. */
  schemaName?: string;
}

function statusLabel(status?: string): string | null {
  if (!status) return null;
  return RESULT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function RecordContextBar({ focusedRow, schemaName }: RecordContextBarProps) {
  const subjectLabel = focusedRow?.subject.label;
  const subjectKey = focusedRow?.subject.key;
  const status = statusLabel(focusedRow?.slots.result.status);
  const process = focusedRow?.slots.process.note?.trim();

  const crumbs: string[] = [];
  if (schemaName) crumbs.push(schemaName);
  if (subjectLabel) crumbs.push(`对象 ${subjectLabel}`);
  if (subjectKey && subjectKey !== subjectLabel) crumbs.push(`键 ${subjectKey}`);
  if (status) crumbs.push(`结论 ${status}`);
  if (process) crumbs.push(`过程 ${process.length > 12 ? process.slice(0, 12) + '…' : process}`);

  return (
    <div className="flex min-w-0 items-center gap-2 border-b bg-card/95 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur">
      <Table2 className="h-3.5 w-3.5 shrink-0 text-primary" />
      {crumbs.length === 0 ? (
        <span className="truncate text-xs">尚未选中记录行</span>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{c}</span>
              {i < crumbs.length - 1 && <span className="shrink-0 text-muted-foreground/40">·</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
