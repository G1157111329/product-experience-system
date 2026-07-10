'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { PresignedImage } from '@/components/presigned-media';
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

type ReEvaluation = {
  id: string;
  issue_id: string;
  description: string | null;
  ai_result: { score: number; summary: string } | null;
  created_at: string;
  created_by: string | null;
  materials?: Array<{
    id: string;
    material_type: string;
    file_url: string;
    file_path: string | null;
    file_name: string;
  }>;
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
  const [reEvaluations, setReEvaluations] = useState<ReEvaluation[]>([]);
  const [newReEvalDescription, setNewReEvalDescription] = useState('');
  const [newReEvalMaterialIds, setNewReEvalMaterialIds] = useState<string[]>([]);
  const [newReEvalMaterials, setNewReEvalMaterials] = useState<Material[]>([]);
  const [savingReEval, setSavingReEval] = useState(false);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [editingReEvalId, setEditingReEvalId] = useState<string | null>(null);
  const [editingReEvalDesc, setEditingReEvalDesc] = useState('');
  const [editingReEvalAiScore, setEditingReEvalAiScore] = useState('');
  const [editingReEvalAiSummary, setEditingReEvalAiSummary] = useState('');
  const [savingReEvalEdit, setSavingReEvalEdit] = useState(false);
  const [rectificationHistory, setRectificationHistory] = useState<RectificationHistoryItem[]>([]);

  useEffect(() => {
    if (open && issue) {
      setCurrent(issue);
    } else if (!open) {
      setCurrent(null);
      setReEvaluations([]);
      setNewReEvalDescription('');
      setNewReEvalMaterialIds([]);
      setNewReEvalMaterials([]);
      setEditingReEvalId(null);
      setRectificationHistory([]);
    }
  }, [open, issue]);

  const fetchReEvaluations = useCallback(async (issueId: string) => {
    try {
      const res = await fetch(`/api/issue-re-evaluations?issue_id=${issueId}`);
      const data = await res.json();
      if (data.code === 0) setReEvaluations(data.data || []);
    } catch {
      /* noop */
    }
  }, []);

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
      if (current.source_type === 'recipe_problem') {
        fetchReEvaluations(current.id);
      }
      setNewReEvalDescription('');
      setNewReEvalMaterialIds([]);
      setNewReEvalMaterials([]);
    } else {
      setReEvaluations([]);
      setRectificationHistory([]);
    }
  }, [open, current?.id, current?.source_type, fetchReEvaluations, fetchRectificationHistory]);

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
        const next = { ...current, [field]: value };
        setCurrent(next);
        onSaved?.(next);
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    }
  };

  const updateIssueFields = async (fields: Record<string, unknown>, successMessage?: string) => {
    if (!current) return;
    try {
      const res = await fetch(`/api/issues/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.code === 0) {
        const next = { ...current, ...fields };
        setCurrent(next);
        onSaved?.(next);
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
      await updateIssueFields({
        status: currentStatus === 'verified_closed' ? 'verified_closed' : 'rectifying',
        is_improve: true,
      });
    } else {
      if (currentStatus !== 'waived') {
        await updateIssueFields({
          status: 'waived',
          is_improve: false,
          no_improve_reason: current.no_improve_reason || '标记为不整改',
        });
      }
    }
  };

  const markAsPending = async () => {
    if (!current) return;
    await updateIssueFields({ status: 'open', is_improve: true }, '已标记为待整改');
  };

  // 直接标记为已整改（verified_closed），用户手动确认，不强制走完整状态机流转
  const markAsRectified = async () => {
    if (!current) return;
    const currentStatus = normalizeIssueStatus(current.status);
    if (currentStatus === 'verified_closed') return;
    await updateIssueFields({ status: 'verified_closed', is_improve: true }, '已标记为已整改');
  };

  const handleSaveReEvaluation = async () => {
    if (!current) return;
    setSavingReEval(true);
    try {
      const res = await fetch('/api/issue-re-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: current.id, description: newReEvalDescription }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '保存失败');
        return;
      }
      const reEvalId = data.data.id;
      for (const matId of newReEvalMaterialIds) {
        await fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: matId, re_evaluation_id: reEvalId }),
        });
      }
      for (const mat of newReEvalMaterials) {
        if (!newReEvalMaterialIds.includes(mat.id)) {
          await fetch('/api/materials', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: mat.id, re_evaluation_id: reEvalId }),
          });
        }
      }
      toast.success('复评估保存成功');
      setNewReEvalDescription('');
      setNewReEvalMaterialIds([]);
      setNewReEvalMaterials([]);
      fetchReEvaluations(current.id);
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingReEval(false);
    }
  };

  const handleEvaluate = async (reEvalId: string) => {
    setEvaluating(reEvalId);
    try {
      const res = await fetch(`/api/issue-re-evaluations/${reEvalId}/ai-evaluate`, { method: 'POST' });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '评价失败');
        return;
      }
      toast.success('评价完成');
      if (current) fetchReEvaluations(current.id);
    } catch {
      toast.error('评价失败');
    } finally {
      setEvaluating(null);
    }
  };

  const handleStartEditReEval = (reEval: ReEvaluation) => {
    setEditingReEvalId(reEval.id);
    setEditingReEvalDesc(reEval.description || '');
    setEditingReEvalAiScore(reEval.ai_result ? String(reEval.ai_result.score) : '');
    setEditingReEvalAiSummary(reEval.ai_result?.summary || '');
  };

  const handleSaveReEvalEdit = async (reEvalId: string) => {
    setSavingReEvalEdit(true);
    try {
      const body: Record<string, unknown> = { description: editingReEvalDesc };
      const score = parseFloat(editingReEvalAiScore);
      if (!isNaN(score) || editingReEvalAiSummary) {
        body.ai_result = { score: isNaN(score) ? 0 : score, summary: editingReEvalAiSummary };
      }
      const res = await fetch(`/api/issue-re-evaluations/${reEvalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '保存失败');
        return;
      }
      toast.success('保存成功');
      setEditingReEvalId(null);
      if (current) fetchReEvaluations(current.id);
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingReEvalEdit(false);
    }
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
                    onClick={() => void markAsRectified()}
                    className={cn(
                      'min-h-9 rounded border px-2 py-1.5 text-xs font-medium transition-colors',
                      currentStatus === 'verified_closed' ? 'border-current text-emerald-600' : 'bg-background border-border hover:bg-muted/50',
                    )}
                  >
                    已整改
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

            {current.source && (
              <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded break-all">
                来源: {current.source}
              </div>
            )}

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
                <Badge variant="secondary" className="text-[10px]">{rectificationHistory.length} 次</Badge>
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
                        <span className="text-[10px] text-muted-foreground">
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
                              <Badge className={cn('text-[10px]', v.result === 'passed' ? 'bg-emerald-100 text-emerald-700' : v.result === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
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

            {/* 复测结果记录 — always shown so any issue can record retests */}
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">复测结果记录</span>
                <Badge variant="secondary" className="text-[10px]">{reEvaluations.length} 次</Badge>
              </div>

              <div className="border rounded-lg p-3 space-y-3 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">新增复测</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">描述评价</Label>
                  <Textarea
                    value={newReEvalDescription}
                    onChange={(e) => setNewReEvalDescription(e.target.value)}
                    rows={3}
                    placeholder="输入复测效果描述..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">选择素材</Label>
                  <MaterialPicker
                    taskId={current.task_id}
                    issueId={undefined}
                    selectedIds={newReEvalMaterialIds}
                    initialMaterials={newReEvalMaterials}
                    onSelectionChange={(ids, mats) => {
                      setNewReEvalMaterialIds(ids);
                      setNewReEvalMaterials(mats);
                    }}
                    selectedPreviewSize="sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveReEvaluation}
                    disabled={savingReEval || (!newReEvalDescription && newReEvalMaterialIds.length === 0)}
                  >
                    {savingReEval && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    保存复测
                  </Button>
                </div>
              </div>

              {reEvaluations.length > 0 && (
                <div className="space-y-3">
                  {reEvaluations.map((reEval, idx) => {
                    const roundLabel = idx === 0 ? '最新复测' : `第${reEvaluations.length - idx}次复测`;
                    const isEditing = editingReEvalId === reEval.id;
                    return (
                      <div key={reEval.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">{roundLabel}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(reEval.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                            </span>
                            {!isEditing && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleStartEditReEval(reEval)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <>
                            <Textarea
                              value={editingReEvalDesc}
                              onChange={(e) => setEditingReEvalDesc(e.target.value)}
                              rows={2}
                              placeholder="输入复测效果描述..."
                              className="text-sm"
                            />
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="10"
                                  value={editingReEvalAiScore}
                                  onChange={(e) => setEditingReEvalAiScore(e.target.value)}
                                  className="h-7 w-20 text-sm font-bold"
                                />
                                <span className="text-xs text-muted-foreground">分</span>
                              </div>
                              <Textarea
                                value={editingReEvalAiSummary}
                                onChange={(e) => setEditingReEvalAiSummary(e.target.value)}
                                rows={3}
                                placeholder="评价总结内容..."
                                className="text-xs"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveReEvalEdit(reEval.id)} disabled={savingReEvalEdit}>
                                {savingReEvalEdit && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                保存
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingReEvalId(null)}>
                                取消
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            {reEval.description && (
                              <div className="text-sm bg-muted/30 p-2 rounded break-all">{reEval.description}</div>
                            )}
                            {reEval.materials && reEval.materials.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {reEval.materials.map((mat) => (
                                  <div key={mat.id} className="shrink-0">
                                    {mat.material_type === 'image' ? (
                                      <PresignedImage filePath={mat.file_path || mat.file_url} alt={mat.file_name} className="h-16 w-16 object-cover rounded border" />
                                    ) : (
                                      <div className="h-16 w-16 rounded border bg-muted/30 flex items-center justify-center">
                                        <span className="text-[10px] text-muted-foreground">视频</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {reEval.ai_result ? (
                              <div className="bg-muted/20 rounded-lg p-2 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-primary">{reEval.ai_result.score}分</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    disabled={evaluating === reEval.id}
                                    onClick={() => handleEvaluate(reEval.id)}
                                  >
                                    {evaluating === reEval.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    重新评价
                                  </Button>
                                </div>
                                {reEval.ai_result.summary && (
                                  <p className="text-xs text-muted-foreground break-all">{reEval.ai_result.summary}</p>
                                )}
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={evaluating === reEval.id}
                                onClick={() => handleEvaluate(reEval.id)}
                              >
                                {evaluating === reEval.id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                生成评价
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
