'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IssueRetestPanel } from '@/components/issues/issue-retest-panel';
import { useDictLabels } from '@/hooks/useDictionary';
import { cn } from '@/lib/utils';
import {
  normalizeIssueStatus,
} from '@/lib/server/issue-state-machine';

export type IssueForRectification = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  status: string;
  source: string | null;
  source_type: string | null;
  source_report_id: string | null;
  task_id: string;
  is_improve: boolean | null;
  improve_plan: string | null;
  no_improve_reason: string | null;
  responsible_person: string | null;
  plan_complete_date: string | null;
  actual_complete_date: string | null;
  verification_note: string | null;
  product_model: string | null;
  [key: string]: unknown;
};

type IssueRectificationDialogProps = {
  issue: IssueForRectification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (issue: IssueForRectification) => void;
};

const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

export function IssueRectificationDialog({ issue, open, onOpenChange, onSaved }: IssueRectificationDialogProps) {
  const levelList = useDictLabels('issue_severity_dict');
  const [current, setCurrent] = useState<IssueForRectification | null>(issue);
  const persistedValuesRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    if (open && issue) {
      setCurrent(issue);
      persistedValuesRef.current = { ...issue };
    } else if (!open) {
      setCurrent(null);
    }
  }, [open, issue]);

  const updateField = (field: string, value: unknown) => {
    if (!current) return;
    setCurrent((previous) => previous ? { ...previous, [field]: value } : previous);
  };

  const saveField = async (field: string, value: unknown) => {
    if (!current || persistedValuesRef.current[field] === value) return;
    try {
      const res = await fetch(`/api/issues/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.code === 0) {
        persistedValuesRef.current = { ...persistedValuesRef.current, [field]: value };
        setCurrent((previous) => previous ? { ...previous, ...data.data } : data.data);
        onSaved?.(data.data);
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    }
  };

  const runCommand = async (fields: Record<string, unknown>, successMessage?: string) => {
    if (!current) return;
    try {
      const res = await fetch(`/api/issues/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.code === 0) {
        persistedValuesRef.current = { ...persistedValuesRef.current, ...data.data };
        setCurrent(data.data);
        onSaved?.(data.data);
        if (successMessage) toast.success(successMessage);
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    }
  };

  const updateImproveFlag = async (willImprove: boolean) => {
    if (!current) return;
    if (willImprove) {
      await runCommand({
        transition: 'start_rectify',
        status: 'rectifying',
        is_improve: true,
        improve_plan: current.improve_plan || '开始整改',
        responsible_person: current.responsible_person,
        plan_complete_date: current.plan_complete_date,
      });
    } else {
      if (currentStatus !== 'waived') {
        await runCommand({
          transition: 'waive',
          status: 'waived',
          is_improve: false,
          no_improve_reason: current.no_improve_reason || '标记为不整改',
        });
      }
    }
  };

  const markAsPending = async () => {
    if (!current) return;
    await runCommand({ transition: 'triage', status: 'open', is_improve: true }, '已保存为待整改');
  };

  // 直接标记为整改完成（verified_closed），用户手动确认。
  const markAsRectified = async () => {
    if (!current) return;
    await runCommand({
      transition: 'verify',
      status: 'verified_closed',
      is_improve: true,
      verification_note: current.verification_note || '整改验证通过',
      actual_complete_date: current.actual_complete_date || new Date().toISOString().slice(0, 10),
    }, '已标记为整改完成');
  };

  const currentStatus = normalizeIssueStatus(current?.status || 'open');
  const willImprove = current?.is_improve !== false && currentStatus !== 'waived';

  return (
    <Dialog open={open} onOpenChange={(v) => onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base break-all">{current?.title || '问题点整改'}</DialogTitle>
        </DialogHeader>
        {current && (
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>问题点等级</Label>
                <div className="flex gap-1">
                  {levelList.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => { updateField('level', l); void saveField('level', l); }}
                      className={cn(
                        'flex-1 whitespace-nowrap px-2 py-1.5 rounded text-xs font-medium border transition-colors',
                        current.level === l ? LEVEL_COLORS[l] + ' border-current' : 'bg-background border-border hover:bg-muted/50'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>整改状态</Label>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => void markAsPending()}
                    aria-pressed={currentStatus === 'open'}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'open' ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    待整改
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateImproveFlag(true)}
                    aria-pressed={currentStatus === 'rectifying'}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'rectifying' ? 'border-amber-600 bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/20' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    整改中
                  </button>
                  <button
                    type="button"
                    onClick={() => void markAsRectified()}
                    aria-pressed={currentStatus === 'verified_closed'}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'verified_closed' ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    整改完成
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateImproveFlag(false)}
                    aria-pressed={currentStatus === 'waived'}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'waived' ? 'border-slate-600 bg-slate-600 text-white shadow-sm ring-2 ring-slate-600/20' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    不整改
                  </button>
                </div>
                <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
                  当前已保存状态：{currentStatus === 'open' ? '待整改' : currentStatus === 'rectifying' ? '整改中' : currentStatus === 'verified_closed' ? '整改完成' : '不整改'}
                </p>
              </div>
            </div>

            {current.description && current.description !== current.title && (
              <div className="space-y-1.5">
                <Label>问题描述</Label>
                <Textarea
                  value={current.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  onBlur={(e) => void saveField('description', e.currentTarget.value)}
                  rows={3}
                />
              </div>
            )}

            {willImprove ? (
              <>
                <div className="space-y-1.5">
                  <Label>整改方案</Label>
                  <Textarea
                  value={current.improve_plan || ''}
                  onChange={(e) => updateField('improve_plan', e.target.value)}
                  onBlur={(e) => void saveField('improve_plan', e.currentTarget.value)}
                    rows={2}
                    placeholder="填写整改方案..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>责任人</Label>
                    <Input
                      value={current.responsible_person || ''}
                      onChange={(e) => updateField('responsible_person', e.target.value)}
                      onBlur={(e) => void saveField('responsible_person', e.currentTarget.value)}
                      placeholder="责任人"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>计划完成日期</Label>
                    <Input
                      type="date"
                      value={current.plan_complete_date ? current.plan_complete_date.slice(0, 10) : ''}
                      onChange={(e) => updateField('plan_complete_date', e.target.value)}
                      onBlur={(e) => void saveField('plan_complete_date', e.currentTarget.value)}
                    />
                  </div>
                </div>
                {currentStatus === 'verified_closed' && (
                  <div className="space-y-1.5">
                    <Label>验证说明</Label>
                    <Textarea
                      value={current.verification_note || ''}
                      onChange={(e) => updateField('verification_note', e.target.value)}
                      onBlur={(e) => void saveField('verification_note', e.currentTarget.value)}
                      rows={2}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>不整改原因</Label>
                <Textarea
                  value={current.no_improve_reason || ''}
                  onChange={(e) => updateField('no_improve_reason', e.target.value)}
                  onBlur={(e) => void saveField('no_improve_reason', e.currentTarget.value)}
                  rows={2}
                  placeholder="说明不整改原因..."
                />
              </div>
            )}

            <IssueRetestPanel
              issueId={current.id}
              taskId={current.task_id}
              onIssueUpdated={(updatedIssue) => {
                const next = { ...current, ...updatedIssue } as IssueForRectification;
                setCurrent(next);
                onSaved?.(next);
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
