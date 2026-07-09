'use client';

/**
 * Column create / edit dialog — PRD §7.8.2.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ColumnZone, V3Column } from '@/lib/matrix/v3-types';

const ZONE_OPTIONS: Array<{ value: ColumnZone; label: string }> = [
  { value: 'detail_dimension', label: '详细对比维度' },
  { value: 'calculation_dimension', label: '计算列' },
  { value: 'evaluation', label: '效果评价' },
  { value: 'issue_point', label: '问题点' },
];

const DATA_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数值' },
  { value: 'percentage', label: '百分比' },
  { value: 'duration', label: '时长' },
  { value: 'formula', label: '公式' },
  { value: 'issue_point', label: '问题点' },
];

export type ColumnConfigValues = {
  columnLabel: string;
  columnZone: ColumnZone;
  dataType: string;
  unitText: string;
  desktopWidthPx: number;
  isRequired: boolean;
  showInReport: boolean;
  decimalPlaces: number;
};

interface MatrixColumnConfigDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Partial<ColumnConfigValues> | V3Column | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ColumnConfigValues) => void;
  onArchive?: () => void;
}

function defaultsFrom(initial?: Partial<ColumnConfigValues> | V3Column | null): ColumnConfigValues {
  const col = initial as V3Column | undefined;
  return {
    columnLabel: (col?.columnLabel ?? (initial as ColumnConfigValues | undefined)?.columnLabel ?? '').toString(),
    columnZone: (col?.columnZone ?? (initial as ColumnConfigValues | undefined)?.columnZone ?? 'detail_dimension') as ColumnZone,
    dataType: col?.dataType ?? (initial as ColumnConfigValues | undefined)?.dataType ?? 'text',
    unitText: col?.unitText ?? (initial as ColumnConfigValues | undefined)?.unitText ?? '',
    desktopWidthPx: col?.desktopWidthPx ?? (initial as ColumnConfigValues | undefined)?.desktopWidthPx ?? 140,
    isRequired: col?.isRequired ?? (initial as ColumnConfigValues | undefined)?.isRequired ?? false,
    showInReport: col?.showInReport ?? (initial as ColumnConfigValues | undefined)?.showInReport ?? true,
    decimalPlaces: col?.decimalPlaces ?? (initial as ColumnConfigValues | undefined)?.decimalPlaces ?? 2,
  };
}

export function MatrixColumnConfigDialog({
  open,
  mode,
  initial,
  saving,
  onOpenChange,
  onSubmit,
  onArchive,
}: MatrixColumnConfigDialogProps) {
  const [values, setValues] = useState<ColumnConfigValues>(() => defaultsFrom(initial));

  useEffect(() => {
    if (open) setValues(defaultsFrom(initial));
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增列' : '列配置'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>列名称</Label>
            <Input
              value={values.columnLabel}
              onChange={(e) => setValues((v) => ({ ...v, columnLabel: e.target.value }))}
              placeholder="如：耗时、重量、温度"
            />
          </div>
          {mode === 'create' && (
            <div className="space-y-1.5">
              <Label>列分区</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={values.columnZone}
                onChange={(e) => {
                  const zone = e.target.value as ColumnZone;
                  setValues((v) => ({
                    ...v,
                    columnZone: zone,
                    dataType:
                      zone === 'calculation_dimension'
                        ? 'formula'
                        : zone === 'issue_point'
                          ? 'issue_point'
                          : v.dataType === 'formula' || v.dataType === 'issue_point'
                            ? 'text'
                            : v.dataType,
                  }));
                }}
              >
                {ZONE_OPTIONS.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>数据类型</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={values.dataType}
                disabled={mode === 'edit' && values.columnZone === 'calculation_dimension'}
                onChange={(e) => setValues((v) => ({ ...v, dataType: e.target.value }))}
              >
                {DATA_TYPE_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>单位</Label>
              <Input
                value={values.unitText}
                onChange={(e) => setValues((v) => ({ ...v, unitText: e.target.value }))}
                placeholder="g / s / ℃"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>列宽 (px)</Label>
              <Input
                type="number"
                min={40}
                max={800}
                value={values.desktopWidthPx}
                onChange={(e) =>
                  setValues((v) => ({ ...v, desktopWidthPx: Number(e.target.value) || 140 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>小数位</Label>
              <Input
                type="number"
                min={0}
                max={6}
                value={values.decimalPlaces}
                onChange={(e) =>
                  setValues((v) => ({ ...v, decimalPlaces: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.isRequired}
                onCheckedChange={(c) => setValues((v) => ({ ...v, isRequired: c === true }))}
              />
              必填
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.showInReport}
                onCheckedChange={(c) => setValues((v) => ({ ...v, showInReport: c !== false }))}
              />
              在报告中显示
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {mode === 'edit' && onArchive && (
            <Button type="button" variant="destructive" size="sm" className="mr-auto" disabled={saving} onClick={onArchive}>
              归档列
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || !values.columnLabel.trim()}
            onClick={() => onSubmit(values)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? '创建' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
