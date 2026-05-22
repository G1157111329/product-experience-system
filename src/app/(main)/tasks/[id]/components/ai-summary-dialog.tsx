'use client';

import { useState } from 'react';
import { Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AiTaskSummary } from '../types';
import { summaryToForm, linesToList } from '../utils';

type AiSummaryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiSummary: AiTaskSummary | null;
  summaryForm: ReturnType<typeof summaryToForm>;
  onFormChange: (form: ReturnType<typeof summaryToForm>) => void;
  onGenerate: () => void;
  onSave: () => void;
  aiSummarizing: boolean;
  aiSummarySaving: boolean;
};

export function AiSummaryDialog({
  open, onOpenChange, aiSummary, summaryForm, onFormChange,
  onGenerate, onSave, aiSummarizing, aiSummarySaving,
}: AiSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AI总结
          </DialogTitle>
          <DialogDescription>AI会结合五感体验、功能效果、素材和历史同品类同产品报告生成初稿，内容可编辑后进入报告。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
            <div className="space-y-1.5">
              <Label>总结Tag</Label>
              <Input
                value={summaryForm.tag}
                onChange={(e) => onFormChange({ ...summaryForm, tag: e.target.value })}
                placeholder="如：表现稳定"
              />
            </div>
            <div className="space-y-1.5">
              <Label>满意度</Label>
              <Input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={summaryForm.satisfaction_score}
                onChange={(e) => onFormChange({ ...summaryForm, satisfaction_score: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>总评</Label>
            <Textarea
              rows={4}
              value={summaryForm.summary}
              onChange={(e) => onFormChange({ ...summaryForm, summary: e.target.value })}
              placeholder="概括当前产品体验水平、关键证据与整体判断"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>主要优势</Label>
              <Textarea
                rows={4}
                value={summaryForm.strengths}
                onChange={(e) => onFormChange({ ...summaryForm, strengths: e.target.value })}
                placeholder="每行一条"
              />
            </div>
            <div className="space-y-1.5">
              <Label>主要风险</Label>
              <Textarea
                rows={4}
                value={summaryForm.risks}
                onChange={(e) => onFormChange({ ...summaryForm, risks: e.target.value })}
                placeholder="每行一条"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>历史表现判断</Label>
            <Textarea
              rows={3}
              value={summaryForm.historical_position}
              onChange={(e) => onFormChange({ ...summaryForm, historical_position: e.target.value })}
              placeholder="相对历史同品类同产品的体验水平判断"
            />
          </div>
          <div className="space-y-1.5">
            <Label>后续建议</Label>
            <Textarea
              rows={4}
              value={summaryForm.suggestions}
              onChange={(e) => onFormChange({ ...summaryForm, suggestions: e.target.value })}
              placeholder="每行一条"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={onGenerate} disabled={aiSummarizing}>
              <Sparkles className="h-4 w-4 mr-1.5" /> {aiSummarizing ? '重新总结中...' : '重新AI总结'}
            </Button>
            <Button onClick={onSave} disabled={aiSummarySaving}>
              <Save className="h-4 w-4 mr-1.5" /> {aiSummarySaving ? '保存中...' : '保存总结'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
