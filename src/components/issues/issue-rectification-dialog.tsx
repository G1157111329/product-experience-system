'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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

type Verification = {
  id: string;
  rectification_action_id: string;
  issue_id: string;
  result: 'passed' | 'failed' | 'partial';
  note: string | null;
  verified_by: string | null;
  verified_at: string;
  evidence_refs: unknown;
};

type RectificationHistoryItem = {
  id: string;
  issue_id: string;
  action_plan: string;
  responsible_person: string | null;
  responsible_dept: string | null;
  plan_complete_date: string | null;
  actual_complete_date: string | null;
  status: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  verifications: Verification[];
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
  const [rectificationHistory, setRectificationHistory] = useState<RectificationHistoryItem[]>([]);

  useEffect(() => {
    if (open && issue) {
      setCurrent(issue);
    } else if (!open) {
      setCurrent(null);
      setRectificationHistory([]);
    }
  }, [open, issue]);

  const fetchRectificationHistory = useCallback(async (issueId: string) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/rectifications`);
      const data = await res.json();
      if (data.code === 0) setRectificationHistory(data.data || []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (open && current?.id) {
      fetchRectificationHistory(current.id);
    } else {
      setRectificationHistory([]);
    }
  }, [open, current?.id, fetchRectificationHistory]);

  const updateField = async (field: string, value: unknown) => {
    if (!current) return;
    try {
      const res = await fetch(`/api/issues/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setCurrent(data.data);
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
        setCurrent(data.data);
        onSaved?.(data.data);
        await fetchRectificationHistory(current.id);
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
    const currentStatus = normalizeIssueStatus(current.status);
    if (willImprove) {
      if (currentStatus === 'waived' || currentStatus === 'rectifying') return;
      const command = currentStatus === 'verified_closed'
        ? { transition: 'return_to_rectifying', status: 'rectifying' }
        : { transition: 'start_rectify', status: 'rectifying' };
      await runCommand({
        ...command,
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
    if (normalizeIssueStatus(current.status) !== 'open') {
      toast.error('当前状态不能直接返回待整改');
      return;
    }
    await runCommand({ transition: 'triage', status: 'open' }, '已保持为待整改');
  };

  // 直接标记为整改完成（verified_closed），用户手动确认。
  const markAsRectified = async () => {
    if (!current) return;
    const currentStatus = normalizeIssueStatus(current.status);
    if (currentStatus !== 'rectifying') return;
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
                      onClick={() => updateField('level', l)}
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
                    disabled={currentStatus !== 'open'}
                    onClick={() => void markAsPending()}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'open' ? 'border-current text-foreground' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    待整改
                  </button>
                  <button
                    type="button"
                    disabled={currentStatus === 'waived' || currentStatus === 'rectifying'}
                    onClick={() => void updateImproveFlag(true)}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      willImprove && currentStatus !== 'open' && currentStatus !== 'verified_closed' ? 'border-current text-amber-600' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    整改中
                  </button>
                  <button
                    type="button"
                    disabled={currentStatus !== 'rectifying'}
                    onClick={() => void markAsRectified()}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'verified_closed' ? 'border-current text-emerald-600' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    整改完成
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateImproveFlag(false)}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      !willImprove ? 'border-current text-muted-foreground' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    不整改
                  </button>
                </div>
              </div>
            </div>

            {current.description && current.description !== current.title && (
              <div className="space-y-1.5">
                <Label>问题描述</Label>
                <Textarea
                  value={current.description}
                  onChange={(e) => updateField('description', e.target.value)}
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
                      placeholder="责任人"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>计划完成日期</Label>
                    <Input
                      type="date"
                      value={current.plan_complete_date ? current.plan_complete_date.slice(0, 10) : ''}
                      onChange={(e) => updateField('plan_complete_date', e.target.value)}
                    />
                  </div>
                </div>
                {currentStatus === 'verified_closed' && (
                  <div className="space-y-1.5">
                    <Label>验证说明</Label>
                    <Textarea
                      value={current.verification_note || ''}
                      onChange={(e) => updateField('verification_note', e.target.value)}
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
                  rows={2}
                  placeholder="说明不整改原因..."
                />
              </div>
            )}

            {/* 整改历史 — rectification actions + verifications */}
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">整改历史</span>
                <Badge variant="secondary" className="text-xs">{rectificationHistory.length} 次</Badge>
              </div>

              {rectificationHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无整改记录</p>
              ) : (
                <div className="space-y-3">
                  {rectificationHistory.map((action, idx) => (
                    <div key={action.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {idx === 0 ? '最新整改' : `第${rectificationHistory.length - idx}次整改`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(action.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                        </span>
                      </div>
                      <div className="text-sm bg-muted/30 p-2 rounded break-all">{action.action_plan}</div>
                      {action.responsible_person && (
                        <div className="text-xs text-muted-foreground">责任人: {action.responsible_person}</div>
                      )}
                      {action.verifications.length > 0 && (
                        <div className="space-y-1">
                          {action.verifications.map((v) => (
                            <div key={v.id} className="text-xs flex items-center gap-2">
                              <Badge className={cn('text-xs', v.result === 'passed' ? 'bg-emerald-100 text-emerald-700' : v.result === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                                {v.result === 'passed' ? '通过' : v.result === 'failed' ? '不通过' : '部分通过'}
                              </Badge>
                              <span className="text-muted-foreground">{v.note || '无验证说明'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
