'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeIngredientItems, type IngredientItem } from '@/lib/task-context-contract';

export type IngredientDraftItem = {
  name: string;
  quantity?: number | string;
  unit?: string;
  note?: string;
};

export function createIngredientDraft(items: IngredientItem[], legacyText?: string | null): IngredientDraftItem[] {
  if (items.length > 0) return items.map((item) => ({ ...item }));
  const legacyRows = (legacyText || '').split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  return legacyRows.length > 0 ? legacyRows.map((name) => ({ name })) : [{ name: '' }];
}

export function toIngredientPayload(items: IngredientDraftItem[]): IngredientItem[] {
  return normalizeIngredientItems(items);
}

export function shouldShowIngredientEditor(recipeType: string) {
  return recipeType === '食谱';
}

export function formatIngredientTag(item: IngredientDraftItem) {
  const amount = item.quantity === undefined || item.quantity === '' ? '' : String(item.quantity);
  return [item.name.trim(), `${amount}${(item.unit || '').trim()}`.trim()].filter(Boolean).join(' ');
}

export function ingredientTagSummary(items: IngredientDraftItem[], limit = 3) {
  const labels = items.map(formatIngredientTag).filter(Boolean);
  return {
    visible: labels.slice(0, limit),
    hiddenCount: Math.max(0, labels.length - limit),
  };
}

export function RecipeIngredientEditor({
  items,
  legacyText,
  onSave,
}: {
  items: IngredientItem[];
  legacyText?: string | null;
  onSave: (items: IngredientItem[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<IngredientDraftItem[]>(() => createIngredientDraft(items, legacyText));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveVersionRef = useRef(0);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const queueSave = (next: IngredientDraftItem[]) => {
    const payload = toIngredientPayload(next);
    const version = ++saveVersionRef.current;
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        setStatus('saving');
        try {
          await onSave(payload);
          if (saveVersionRef.current === version) setStatus('saved');
        } catch {
          if (saveVersionRef.current === version) setStatus('error');
        }
      });
  };

  const scheduleSave = (next: IngredientDraftItem[], delay = 500) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      queueSave(next);
    }, delay);
  };

  const commitDraft = (next: IngredientDraftItem[], saveDelay = 500) => {
    draftRef.current = next;
    setDraft(next);
    setStatus('idle');
    scheduleSave(next, saveDelay);
  };

  const update = (index: number, patch: Partial<IngredientDraftItem>) => {
    const next = draftRef.current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    commitDraft(next);
  };

  const remove = (index: number) => {
    const next = draftRef.current.filter((_, itemIndex) => itemIndex !== index);
    const safeNext = next.length > 0 ? next : [{ name: '' }];
    commitDraft(safeNext, 0);
  };

  return (
    <section aria-labelledby="recipe-ingredients-title" className="mt-3 rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 id="recipe-ingredients-title" className="text-xs font-semibold">食材参数</h4>
          {status !== 'idle' && (
            <span className={status === 'error' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'} role="status" aria-live="polite">
              {status === 'saving' ? '保存中…' : status === 'saved' ? '已保存' : '保存失败，请重试'}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => commitDraft([...draftRef.current, { name: '' }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />添加食材
        </Button>
      </div>

      <div className="space-y-2">
        {draft.map((item, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1.6fr)_90px_80px_minmax(0,1fr)_32px] gap-2 max-md:grid-cols-[minmax(0,1fr)_72px_64px_32px]">
            <Input aria-label={`食材 ${index + 1} 名称`} value={item.name} placeholder="食材名称" onChange={(event) => update(index, { name: event.target.value })} onBlur={() => scheduleSave(draftRef.current, 120)} />
            <Input aria-label={`食材 ${index + 1} 克重`} inputMode="decimal" value={item.quantity ?? ''} placeholder="克重" onChange={(event) => update(index, { quantity: event.target.value })} onBlur={() => scheduleSave(draftRef.current, 120)} />
            <Input aria-label={`食材 ${index + 1} 单位`} value={item.unit ?? ''} placeholder="单位" onChange={(event) => update(index, { unit: event.target.value })} onBlur={() => scheduleSave(draftRef.current, 120)} />
            <Input aria-label={`食材 ${index + 1} 备注`} value={item.note ?? ''} placeholder="备注" onChange={(event) => update(index, { note: event.target.value })} onBlur={() => scheduleSave(draftRef.current, 120)} className="max-md:col-span-3" />
            <Button type="button" variant="ghost" size="icon" aria-label={`删除食材 ${index + 1}`} className="h-9 w-8" onClick={() => remove(index)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
