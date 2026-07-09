'use client';

/**
 * MatrixSummarySuggestionsDialog — review Hermes matrix summary suggestions
 * before applying to narrative blocks (PRD §11.5 / §11.6).
 */
import { useEffect, useState } from 'react';
import { Loader2, Sparkles, Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface SummarySuggestion {
  id: string;
  blockType: string;
  content: string;
  scopeNodeId?: string | null;
}

interface MatrixSummarySuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrixId: string;
  suggestions: SummarySuggestion[];
  onApplied: () => void;
}

export function MatrixSummarySuggestionsDialog({
  open,
  onOpenChange,
  matrixId,
  suggestions: initial,
  onApplied,
}: MatrixSummarySuggestionsDialogProps) {
  const [items, setItems] = useState<SummarySuggestion[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setItems(initial);
      setEditingId(null);
      setEditDraft('');
    }
  }, [open, initial]);

  const decide = async (
    id: string,
    decision: 'accepted' | 'rejected' | 'edited_then_accepted',
    editedContent?: string,
  ) => {
    setBusyId(id);
    try {
      const body: Record<string, unknown> = { decision, matrixId };
      if (decision === 'edited_then_accepted') {
        body.editedPayload = { content: editedContent ?? '' };
      }
      const res = await fetch(`/api/v1/agent/suggestion-blocks/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.code !== 0) {
        toast.error(json.message || '操作失败');
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== id));
      setEditingId(null);
      if (decision === 'rejected') {
        toast.message('已拒绝该建议');
      } else {
        toast.success('已写入矩阵小结');
        onApplied();
      }
    } catch {
      toast.error('操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const remaining = items.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI 小结建议
          </DialogTitle>
          <DialogDescription>
            建议不会自动写入。请逐条采纳、编辑后采纳或拒绝。
            {remaining > 0 ? ` 剩余 ${remaining} 条。` : ' 全部已处理。'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-3 pr-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">没有待处理建议</p>
            ) : (
              items.map((s) => (
                <div key={s.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {s.scopeNodeId ? '一级大类小结' : '矩阵小结'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {s.blockType}
                    </Badge>
                  </div>
                  {editingId === s.id ? (
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={5}
                      className="text-sm"
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{s.content}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {editingId === s.id ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === s.id || !editDraft.trim()}
                          onClick={() => void decide(s.id, 'edited_then_accepted', editDraft)}
                        >
                          {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                          保存并采纳
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          取消编辑
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === s.id}
                          onClick={() => void decide(s.id, 'accepted')}
                        >
                          {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                          采纳
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === s.id}
                          onClick={() => {
                            setEditingId(s.id);
                            setEditDraft(s.content);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === s.id}
                          onClick={() => void decide(s.id, 'rejected')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          拒绝
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
