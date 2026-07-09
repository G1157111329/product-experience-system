'use client';

/**
 * InlineEditable — platform-level click-to-edit + autosave component.
 *
 * PRD V3.1.2.4 §5.1: all plain input areas switch from "edit/save button" mode
 * to "click content → enter edit → stop input/blur/switch → autosave".
 *
 * Applies to: 功能效果说明, 五感体验记录, 问题现象, 整改说明, 复测结论,
 * 报告总结, 既有对比矩阵单元格, 动态数据矩阵单元格/列名/行头/小结/备注.
 *
 * Two variants:
 *   - <InlineEditable.Text>     single-line (renders <Input>)
 *   - <InlineEditable.Textarea> multi-line (renders <Textarea>)
 *
 * Save UX (driven by useDebouncedSave):
 *   idle (no chrome) → dirty ("未保存") → saving ("保存中") → saved ("已保存" flash)
 *   → error ("保存失败，点击重试") → conflict (opens conflict panel)
 *
 * The save function receives the new string and returns
 *   { conflict: true } for a 409 (caller renders ConflictPanel),
 *   void / { conflict: false } for success,
 *   throws for error.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useDebouncedSave, type SaveStatus } from '@/hooks/use-debounced-save';

export interface InlineSaveResult {
  conflict?: boolean;
  /** Server version when 409; used by conflict panel force-overwrite. */
  serverVersion?: string | number;
  /** New version after successful save. */
  version?: string | number;
}

export interface InlineEditableBaseProps {
  /** Current authoritative value (server state). */
  value: string;
  /** Placeholder shown in edit mode when empty. */
  placeholder?: string;
  /** Persist the new value. Return {conflict:true} for 409, throw for error. */
  onSave: (value: string) => Promise<InlineSaveResult | void>;
  /**
   * Optional force-save after conflict (omit If-Match). When provided, the
   * conflict panel shows a "覆盖保存" action.
   */
  onForceSave?: (value: string) => Promise<InlineSaveResult | void>;
  /** Disable editing (read-only display). */
  readOnly?: boolean;
  /** Extra classes for the display wrapper. */
  className?: string;
  /** Extra classes for the input/textarea element. */
  inputClassName?: string;
  /** Optional aria label for accessibility. */
  ariaLabel?: string;
}

export type InlineTextProps = InlineEditableBaseProps;

export interface InlineTextareaProps extends InlineEditableBaseProps {
  /** Min rows for the textarea. */
  rows?: number;
}

const STATUS_LABEL: Partial<Record<SaveStatus, string>> = {
  dirty: '未保存',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败，点击重试',
  conflict: '内容冲突，需处理',
  offline_queued: '待同步',
};

const STATUS_CLASS: Partial<Record<SaveStatus, string>> = {
  dirty: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  saved: 'text-emerald-600',
  error: 'text-red-600',
  conflict: 'text-amber-600',
  offline_queued: 'text-muted-foreground',
};

/**
 * Shared status badge rendered next to the field.
 */
function SaveStatusBadge({
  status,
  onRetry,
  onForceOverwrite,
}: {
  status: SaveStatus;
  onRetry: () => void;
  onForceOverwrite?: () => void;
}) {
  if (status === 'idle') return null;
  const label = STATUS_LABEL[status];
  if (!label) return null;
  const isRetryable = status === 'error';
  const isConflict = status === 'conflict';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs leading-none select-none flex-wrap',
        STATUS_CLASS[status],
      )}
      role="status"
      aria-live="polite"
    >
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'error' && <AlertTriangle className="h-3 w-3" />}
      {status === 'conflict' && <AlertTriangle className="h-3 w-3" />}
      {isRetryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        >
          {label}
          <RefreshCw className="h-3 w-3" />
        </button>
      ) : (
        label
      )}
      {isConflict && onForceOverwrite && (
        <button
          type="button"
          onClick={onForceOverwrite}
          className="ml-1 underline-offset-2 hover:underline font-medium"
        >
          覆盖保存
        </button>
      )}
      {isConflict && (
        <button
          type="button"
          onClick={onRetry}
          className="underline-offset-2 hover:underline"
        >
          重试
        </button>
      )}
    </span>
  );
}

function useInlineEditableEngine(
  value: string,
  onSave: (value: string) => Promise<InlineSaveResult | void>,
  onForceSave?: (value: string) => Promise<InlineSaveResult | void>,
) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Resync local draft when authoritative value changes externally.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const { status, schedule, flush, reset, setStatus } = useDebouncedSave(onSave);

  const handleChange = (next: string) => {
    setDraft(next);
    schedule(next);
  };

  const handleBlur = () => {
    // Only flush if the draft diverges from authoritative value.
    if (draft !== value) {
      flush();
    } else {
      reset();
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    schedule(draft);
    flush();
  };

  const handleForceOverwrite = () => {
    if (!onForceSave) {
      handleRetry();
      return;
    }
    setStatus('saving');
    void onForceSave(draft)
      .then((result) => {
        if (result && result.conflict) setStatus('conflict');
        else setStatus('saved');
      })
      .catch(() => setStatus('error'));
  };

  return {
    draft,
    status,
    inputRef,
    handleChange,
    handleBlur,
    handleRetry,
    handleForceOverwrite: onForceSave ? handleForceOverwrite : undefined,
    setStatus,
  };
}

function TextImpl({
  value,
  placeholder,
  onSave,
  onForceSave,
  readOnly,
  className,
  inputClassName,
  ariaLabel,
}: InlineTextProps) {
  const { draft, status, inputRef, handleChange, handleBlur, handleRetry, handleForceOverwrite } =
    useInlineEditableEngine(value, onSave, onForceSave);

  if (readOnly) {
    return (
      <span className={cn('inline-block min-w-0', className)} title={value || placeholder}>
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex flex-col gap-0.5 min-w-0', className)}>
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={cn('h-8', inputClassName)}
      />
      <SaveStatusBadge status={status} onRetry={handleRetry} onForceOverwrite={handleForceOverwrite} />
    </span>
  );
}

function TextareaImpl({
  value,
  placeholder,
  onSave,
  onForceSave,
  readOnly,
  className,
  inputClassName,
  ariaLabel,
  rows = 3,
}: InlineTextareaProps) {
  const { draft, status, inputRef, handleChange, handleBlur, handleRetry, handleForceOverwrite } =
    useInlineEditableEngine(value, onSave, onForceSave);

  if (readOnly) {
    return (
      <div className={cn('min-w-0 whitespace-pre-wrap', className)}>
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </div>
    );
  }

  return (
    <span className={cn('inline-flex flex-col gap-0.5 min-w-0 w-full', className)}>
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={rows}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={cn('resize-y', inputClassName)}
      />
      <SaveStatusBadge status={status} onRetry={handleRetry} onForceOverwrite={handleForceOverwrite} />
    </span>
  );
}

/**
 * Platform-level InlineEditable. Use `<InlineEditable.Text>` for single-line
 * and `<InlineEditable.Textarea>` for multi-line.
 *
 * @example
 * <InlineEditable.Textarea
 *   value={recipe.effectDescription}
 *   onSave={async (v) => { await patchRecipeField(recipe.id, 'effect_description', v); }}
 *   placeholder="输入效果说明..."
 * />
 */
export const InlineEditable = {
  Text: TextImpl,
  Textarea: TextareaImpl,
};

export { useInlineEditableEngine };
export type { SaveStatus };
