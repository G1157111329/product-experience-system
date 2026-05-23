'use client';

import { useMemo, useState } from 'react';
import { RotateCcw, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  buildDisplayReportContent,
  mergeReviewOverrides,
  type AiSummaryLike,
  type ReportContentWithReview,
  type ReviewStatus,
} from '@/lib/report-review-overrides';

type ReportReviewEditorProps = {
  report: {
    id: string;
    title: string;
    content: ReportContentWithReview | null;
  };
  onSaved: (report: { title: string; content: ReportContentWithReview }) => void;
};

function listToText(value: string[] | undefined) {
  return (value || []).join('\n');
}

function textToList(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function summaryToForm(summary: AiSummaryLike | null | undefined, title: string, note?: string, status?: ReviewStatus) {
  return {
    title,
    tag: summary?.tag || '',
    satisfaction_score: String(summary?.satisfaction_score ?? ''),
    summary: summary?.summary || '',
    strengths: listToText(summary?.strengths),
    risks: listToText(summary?.risks),
    historical_position: summary?.historical_position || '',
    suggestions: listToText(summary?.suggestions),
    review_note: note || '',
    review_status: status || 'draft',
  };
}

export function ReportReviewEditor({ report, onSaved }: ReportReviewEditorProps) {
  const display = useMemo(() => buildDisplayReportContent(report), [report]);
  const generatedSummary = report.content?.ai_summary || null;
  const [form, setForm] = useState(() => summaryToForm(display.ai_summary, display.title, display.review_note, display.review_status));
  const [saving, setSaving] = useState(false);

  const handleResetSummary = () => {
    setForm(summaryToForm(generatedSummary, report.title, display.review_note, display.review_status));
  };

  const handleSave = async () => {
    if (!report.content || saving) return;
    setSaving(true);
    try {
      const nextContent = mergeReviewOverrides(report.content, {
        title: form.title.trim(),
        ai_summary: {
          tag: form.tag.trim(),
          satisfaction_score: form.satisfaction_score === '' ? null : Math.min(10, Math.max(0, Number(form.satisfaction_score) || 0)),
          summary: form.summary.trim(),
          strengths: textToList(form.strengths),
          risks: textToList(form.risks),
          historical_position: form.historical_position.trim(),
          suggestions: textToList(form.suggestions),
        },
        review_note: form.review_note.trim(),
        review_status: form.review_status as ReviewStatus,
      });

      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || report.title,
          content: nextContent,
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        onSaved({ title: data.data.title, content: data.data.content });
        toast.success('报告评审内容已保存');
      } else {
        toast.error(data.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="rounded-lg border bg-card p-4 shadow-sm lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">报告评审编辑</p>
          <h2 className="mt-1 text-lg font-semibold">表达层润色</h2>
        </div>
        <Badge variant={form.review_status === 'published' ? 'default' : form.review_status === 'reviewed' ? 'secondary' : 'outline'}>
          {form.review_status === 'published' ? '已发布' : form.review_status === 'reviewed' ? '已评审' : '待评审'}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label>报告标题</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-2">
          <div className="space-y-1.5">
            <Label>结论标签</Label>
            <Input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="如：表现稳定" />
          </div>
          <div className="space-y-1.5">
            <Label>满意度</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={form.satisfaction_score}
              onChange={(e) => setForm({ ...form, satisfaction_score: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>总评</Label>
          <Textarea rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>主要优势</Label>
          <Textarea rows={3} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} placeholder="每行一条" />
        </div>

        <div className="space-y-1.5">
          <Label>主要风险</Label>
          <Textarea rows={3} value={form.risks} onChange={(e) => setForm({ ...form, risks: e.target.value })} placeholder="每行一条" />
        </div>

        <div className="space-y-1.5">
          <Label>历史表现</Label>
          <Textarea rows={2} value={form.historical_position} onChange={(e) => setForm({ ...form, historical_position: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>后续建议</Label>
          <Textarea rows={3} value={form.suggestions} onChange={(e) => setForm({ ...form, suggestions: e.target.value })} placeholder="每行一条" />
        </div>

        <div className="space-y-1.5">
          <Label>评审备注</Label>
          <Textarea rows={3} value={form.review_note} onChange={(e) => setForm({ ...form, review_note: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label>评审状态</Label>
          <Select value={form.review_status} onValueChange={(value) => setForm({ ...form, review_status: value as ReviewStatus })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">待评审</SelectItem>
              <SelectItem value="reviewed">已评审</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? '保存中...' : '保存评审内容'}
        </Button>
        <Button type="button" variant="outline" onClick={handleResetSummary}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          恢复生成原文
        </Button>
      </div>

      <p className="mt-3 flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        这里仅编辑报告表达。检查记录、素材和问题点请回到任务详情页修改，避免事实数据分叉。
      </p>
    </aside>
  );
}
