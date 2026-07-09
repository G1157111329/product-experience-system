'use client';

import { Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AiTaskSummary } from '../types';
import { summaryToForm } from '../utils';

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
  open, onOpenChange, summaryForm, onFormChange,
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
            <div className="space-y-1.5">
              <Label>AI总结（可编辑）</Label>
              <Textarea
                rows={16}
                value={summaryForm.text}
                onChange={(e) => onFormChange({ text: e.target.value })}
                placeholder={'总结：\n满意度：\n主要优势：\n主要风险：\n历史表现：\n后续建议：'}
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
