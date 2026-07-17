'use client';

/**
 * Matrix cell / column-header style toolbar (PRD §8.8).
 * Token whitelist only — no raw CSS.
 */
import { Bold, Italic, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { V3CellStyle } from '@/lib/matrix/v3-types';

const COLORS: Array<{ token: string; label: string; className: string }> = [
  { token: 'font_color_default', label: '默认', className: 'bg-foreground' },
  { token: 'font_color_red', label: '红', className: 'bg-red-600' },
  { token: 'font_color_orange', label: '橙', className: 'bg-orange-600' },
  { token: 'font_color_blue', label: '蓝', className: 'bg-blue-600' },
];

const SIZES: Array<{ token: string; label: string }> = [
  { token: 'xs', label: 'XS' },
  { token: 'sm', label: 'S' },
  { token: 'md', label: 'M' },
  { token: 'lg', label: 'L' },
  { token: 'xl', label: 'XL' },
];

export type StyleTarget = {
  type: 'cell' | 'column_header';
  id: string;
  label: string;
};

interface MatrixStyleToolbarProps {
  target: StyleTarget | null;
  current?: V3CellStyle;
  saving?: boolean;
  onApply: (patch: {
    fontColorToken?: string | null;
    fontSizeToken?: string | null;
    bold?: boolean;
    italic?: boolean;
  }) => void;
  onClearSelection?: () => void;
}

export function MatrixStyleToolbar({
  target,
  current,
  saving,
  onApply,
  onClearSelection,
}: MatrixStyleToolbarProps) {
  if (!target) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <Type className="h-3.5 w-3.5" />
        选中单元格或列头后可设置文字样式
      </div>
    );
  }

  const color = current?.fontColorToken || 'font_color_default';
  const size = current?.fontSizeToken || 'sm';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs">
      <span className="text-muted-foreground truncate max-w-[160px]">
        {target.type === 'column_header' ? '列头' : '单元格'} · {target.label}
      </span>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c.token}
            type="button"
            title={c.label}
            disabled={saving}
            onClick={() => onApply({ fontColorToken: c.token === 'font_color_default' ? null : c.token })}
            className={cn(
              'h-5 w-5 rounded-full border',
              c.className,
              color === c.token && 'ring-2 ring-primary ring-offset-1',
            )}
          />
        ))}
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-0.5">
        {SIZES.map((s) => (
          <Button
            key={s.token}
            type="button"
            size="sm"
            variant={size === s.token ? 'secondary' : 'ghost'}
            className="h-6 px-1.5 text-xs"
            disabled={saving}
            onClick={() => onApply({ fontSizeToken: s.token })}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="h-4 w-px bg-border" />
      <Button
        type="button"
        size="sm"
        variant={current?.bold ? 'secondary' : 'ghost'}
        className="h-6 w-6 p-0"
        disabled={saving}
        onClick={() => onApply({ bold: !current?.bold })}
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={current?.italic ? 'secondary' : 'ghost'}
        className="h-6 w-6 p-0"
        disabled={saving}
        onClick={() => onApply({ italic: !current?.italic })}
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      {onClearSelection && (
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={onClearSelection}>
          取消选中
        </Button>
      )}
    </div>
  );
}
