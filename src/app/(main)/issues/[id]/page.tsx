'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getIssueStatusPresentation, normalizeIssueStatus, type IssueStatus, type IssueTransition } from '@/lib/server/issue-state-machine';

interface IssueDetail {
  id: string;
  title: string;
  product_model: string | null;
  category: string | null;
  sub_category: string | null;
  severity: string;
  priority: string;
  status: string;
  description: string | null;
  is_improve: boolean | null;
  no_improve_reason: string | null;
  improve_plan: string | null;
  responsible_dept: string | null;
  responsible_person: string | null;
  plan_complete_date: string | null;
  actual_complete_date: string | null;
  is_closed: boolean;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
  provenance?: {
    task: { id: string; task_name: string; task_no: string | null } | null;
    record: { id: string; task_id: string; check_item: string; evaluation_result: string | null } | null;
    report: { id: string; title: string | null; report_no: string | null } | null;
    recipe: { id: string; task_id: string; name: string } | null;
    recipe_step: { id: string; recipe_id: string; step_number: number; operation: string } | null;
  };
}

const severityColors: Record<string, string> = {
  '致命': 'bg-red-100 text-red-700',
  '严重': 'bg-amber-100 text-amber-700',
  '一般': 'bg-blue-100 text-blue-700',
  '轻微': 'bg-emerald-100 text-emerald-700',
};

const STATUS_FLOW: { code: IssueStatus; label: string }[] = [
  { code: 'open', label: getIssueStatusPresentation('open').label },
  { code: 'rectifying', label: getIssueStatusPresentation('rectifying').label },
  { code: 'verified_closed', label: getIssueStatusPresentation('verified_closed').label },
  { code: 'waived', label: getIssueStatusPresentation('waived').label },
];

const statusTransitionFor = (from: IssueStatus, to: IssueStatus): IssueTransition | null => {
  if (from === to) return null;
  if (to === 'rectifying' && from === 'open') return 'start_rectify';
  if (to === 'rectifying' && from === 'verified_closed') return 'return_to_rectifying';
  if (to === 'verified_closed' && from === 'rectifying') return 'verify';
  if (to === 'waived' && (from === 'open' || from === 'rectifying' || from === 'verified_closed')) return 'waive';
  return null;
};

const EDITABLE_ISSUE_FIELDS = new Set<keyof IssueDetail>([
  'title', 'product_model', 'category', 'sub_category', 'severity', 'priority', 'status', 'description',
  'is_improve', 'no_improve_reason', 'improve_plan', 'responsible_dept', 'responsible_person',
  'plan_complete_date', 'actual_complete_date', 'is_closed', 'verification_note',
]);

const TRANSITION_CONTEXT_FIELDS: Partial<Record<IssueTransition, Array<keyof IssueDetail>>> = {
  assign: ['responsible_person', 'responsible_dept', 'plan_complete_date'],
  start_rectify: ['improve_plan', 'responsible_person', 'responsible_dept', 'plan_complete_date'],
  submit_verification: ['verification_note', 'actual_complete_date'],
  verify: ['verification_note', 'actual_complete_date'],
  waive: ['is_improve', 'no_improve_reason'],
  return_to_rectifying: ['verification_note', 'improve_plan'],
};

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<IssueDetail>>({});
  const [statusTransition, setStatusTransition] = useState<IssueTransition | undefined>();

  useEffect(() => {
    fetch(`/api/issues/${id}`).then(r => r.json()).then(res => {
      if (res.code === 0) { setIssue(res.data); setForm(res.data); }
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => (
        EDITABLE_ISSUE_FIELDS.has(key as keyof IssueDetail)
        && value !== issue?.[key as keyof IssueDetail]
      )),
    ) as Record<string, unknown>;
    if (statusTransition) {
      payload.transition = statusTransition;
      payload.status = form.status;
      for (const field of TRANSITION_CONTEXT_FIELDS[statusTransition] || []) {
        if (form[field] !== undefined) payload[field] = form[field];
      }
    }
    const res = await fetch(`/api/issues/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.code === 0) {
      setIssue(data.data);
      setEditing(false);
      setStatusTransition(undefined);
      toast.success('保存成功');
    } else {
      toast.error(data.message || '保存失败');
    }
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!issue) return <div className="p-6">问题不存在</div>;

  const persistedStatus = normalizeIssueStatus(issue.status);
  const selectedStatus = normalizeIssueStatus(form.status ?? issue.status);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{issue.title}</h1>
            <Badge className={cn('text-xs', severityColors[issue.severity] || '')}>{issue.severity}</Badge>
            <Badge variant="secondary" className="text-xs">{issue.priority}</Badge>
          </div>
        </div>
        <Button size="sm" variant={editing ? 'default' : 'outline'} onClick={editing ? handleSave : () => setEditing(true)}>
          {editing ? <><Save className="h-4 w-4 mr-1.5" /> 保存</> : '编辑'}
        </Button>
      </div>

      {/* Status Flow */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUS_FLOW.map((step, idx) => {
              const transition = statusTransitionFor(normalizeIssueStatus(issue.status), step.code);
              const selected = selectedStatus === step.code;
              const isPersisted = persistedStatus === step.code;
              return (
              <div key={step.code} className="min-w-0">
                <button
                  aria-pressed={selected}
                  disabled={!editing || (!isPersisted && !transition)}
                  onClick={() => {
                    if (!editing) return;
                    if (isPersisted) {
                      setForm({ ...form, status: issue.status });
                      setStatusTransition(undefined);
                      return;
                    }
                    if (!transition) return;
                    setForm({ ...form, status: step.code });
                    setStatusTransition(transition);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    editing && 'cursor-pointer hover:opacity-80'
                  )}
                >
                  <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">
                    {idx + 1}
                  </span>
                  {step.label}
                </button>
              </div>
            )})}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">来源与归属</CardTitle></CardHeader>
        <CardContent>
          <nav aria-label="问题来源链" className="flex flex-wrap items-center gap-2 text-sm">
            {issue.provenance?.task && (
              <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/tasks/${issue.provenance.task.id}`}>
                所属任务：{issue.provenance.task.task_name || issue.provenance.task.task_no || issue.provenance.task.id}
              </Link>
            )}
            {issue.provenance?.record && (
              <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/tasks/${issue.provenance.record.task_id}?tab=senses&record_id=${issue.provenance.record.id}`}>
                来源检查项：{issue.provenance.record.check_item}
              </Link>
            )}
            {issue.provenance?.report && (
              <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/reports/${issue.provenance.report.id}`}>
                关联报告：{issue.provenance.report.title || issue.provenance.report.report_no || issue.provenance.report.id}
              </Link>
            )}
            {issue.provenance?.recipe && (
              <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/tasks/${issue.provenance.recipe.task_id}?tab=functions&recipe_id=${issue.provenance.recipe.id}`}>
                来源食谱/功能：{issue.provenance.recipe.name}
              </Link>
            )}
            {issue.provenance?.recipe_step && issue.provenance?.recipe && (
              <Link className="rounded-md border px-3 py-2 hover:bg-muted" href={`/tasks/${issue.provenance.recipe.task_id}?tab=functions&recipe_id=${issue.provenance.recipe.id}&recipe_step_id=${issue.provenance.recipe_step.id}`}>
                来源步骤：第 {issue.provenance.recipe_step.step_number} 步 · {issue.provenance.recipe_step.operation}
              </Link>
            )}
            {!issue.provenance?.task && !issue.provenance?.record && !issue.provenance?.report && !issue.provenance?.recipe && <span className="text-muted-foreground">暂无可追溯来源</span>}
          </nav>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">基本信息</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">严重等级</Label>
                    <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="致命">致命</SelectItem><SelectItem value="严重">严重</SelectItem><SelectItem value="一般">一般</SelectItem><SelectItem value="轻微">轻微</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">优先级</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="P0">P0</SelectItem><SelectItem value="P1">P1</SelectItem><SelectItem value="P2">P2</SelectItem><SelectItem value="P3">P3</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">问题描述</Label>
                  <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground">产品型号</span><p>{issue.product_model || '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">问题分类</span><p>{issue.category || '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">责任部门</span><p>{issue.responsible_dept || '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">责任人</span><p>{issue.responsible_person || '-'}</p></div>
                </div>
                {issue.description && <div><span className="text-xs text-muted-foreground">问题描述</span><p className="text-sm mt-1 bg-muted/30 p-2 rounded-lg">{issue.description}</p></div>}
              </>
            )}
          </CardContent>
        </Card>

        {/* Rectification */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">整改信息</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1.5"><Label className="text-xs">是否整改</Label>
                  <Select value={form.is_improve ? 'true' : 'false'} onValueChange={(v) => setForm({ ...form, is_improve: v === 'true' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">是</SelectItem><SelectItem value="false">否</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.is_improve ? (
                  <div className="space-y-1.5"><Label className="text-xs">整改方案</Label>
                    <Textarea value={form.improve_plan || ''} onChange={(e) => setForm({ ...form, improve_plan: e.target.value })} rows={3} />
                  </div>
                ) : (
                  <div className="space-y-1.5"><Label className="text-xs">不整改原因</Label>
                    <Textarea value={form.no_improve_reason || ''} onChange={(e) => setForm({ ...form, no_improve_reason: e.target.value })} rows={2} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">计划完成</Label>
                    <Input type="date" value={form.plan_complete_date || ''} onChange={(e) => setForm({ ...form, plan_complete_date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">实际完成</Label>
                    <Input type="date" value={form.actual_complete_date || ''} onChange={(e) => setForm({ ...form, actual_complete_date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">验证说明</Label>
                  <Textarea value={form.verification_note || ''} onChange={(e) => setForm({ ...form, verification_note: e.target.value })} rows={2} />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground">是否整改</span><p>{issue.is_improve ? '是' : '否'}</p></div>
                  <div><span className="text-xs text-muted-foreground">是否关闭</span><p>{issue.is_closed ? '是' : '否'}</p></div>
                  <div><span className="text-xs text-muted-foreground">计划完成</span><p>{issue.plan_complete_date || '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">实际完成</span><p>{issue.actual_complete_date || '-'}</p></div>
                </div>
                {issue.improve_plan && <div><span className="text-xs text-muted-foreground">整改方案</span><p className="text-sm mt-1 bg-muted/30 p-2 rounded-lg">{issue.improve_plan}</p></div>}
                {issue.no_improve_reason && <div><span className="text-xs text-muted-foreground">不整改原因</span><p className="text-sm mt-1 bg-muted/30 p-2 rounded-lg">{issue.no_improve_reason}</p></div>}
                {issue.verification_note && <div><span className="text-xs text-muted-foreground">验证说明</span><p className="text-sm mt-1 bg-muted/30 p-2 rounded-lg">{issue.verification_note}</p></div>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
