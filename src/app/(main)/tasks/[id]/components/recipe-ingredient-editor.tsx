'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    setDraft(createIngredientDraft(items, legacyText));
    setStatus('idle');
  }, [items, legacyText]);

  const save = async (next: IngredientDraftItem[]) => {
    setStatus('saving');
    try {
      await onSave(toIngredientPayload(next));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  const update = (index: number, patch: Partial<IngredientDraftItem>) => {
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const remove = (index: number) => {
    const next = draft.filter((_, itemIndex) => itemIndex !== index);
    const safeNext = next.length > 0 ? next : [{ name: '' }];
    setDraft(safeNext);
    void save(safeNext);
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
          onClick={() => setDraft((current) => [...current, { name: '' }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />添加食材
        </Button>
      </div>

      <div className="space-y-2">
        {draft.map((item, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1.6fr)_90px_80px_minmax(0,1fr)_32px] gap-2 max-md:grid-cols-[minmax(0,1fr)_72px_64px_32px]">
            <Input aria-label={`食材 ${index + 1} 名称`} value={item.name} placeholder="食材名称" onChange={(event) => update(index, { name: event.target.value })} onBlur={() => void save(draft)} />
            <Input aria-label={`食材 ${index + 1} 克重`} inputMode="decimal" value={item.quantity ?? ''} placeholder="克重" onChange={(event) => update(index, { quantity: event.target.value })} onBlur={() => void save(draft)} />
            <Input aria-label={`食材 ${index + 1} 单位`} value={item.unit ?? ''} placeholder="单位" onChange={(event) => update(index, { unit: event.target.value })} onBlur={() => void save(draft)} />
            <Input aria-label={`食材 ${index + 1} 备注`} value={item.note ?? ''} placeholder="备注" onChange={(event) => update(index, { note: event.target.value })} onBlur={() => void save(draft)} className="max-md:col-span-3" />
            <Button type="button" variant="ghost" size="icon" aria-label={`删除食材 ${index + 1}`} className="h-9 w-8" onClick={() => remove(index)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
