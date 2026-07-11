'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { IngredientItem } from '@/lib/task-context-contract';
import {
  createIngredientDraft,
  ingredientTagSummary,
  RecipeIngredientEditor,
} from './recipe-ingredient-editor';

export function RecipeIngredientSummary({
  items,
  legacyText,
  onSave,
}: {
  items: IngredientItem[];
  legacyText?: string | null;
  onSave: (items: IngredientItem[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { visible, hiddenCount } = ingredientTagSummary(createIngredientDraft(items, legacyText));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="编辑食材参数"
          className="h-auto min-h-8 justify-start px-0 hover:bg-transparent"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="flex flex-wrap items-center gap-1.5 text-left">
            {visible.length > 0 ? visible.map((label, index) => (
              <Badge key={`${label}-${index}`} variant="outline">{label}</Badge>
            )) : (
              <span className="text-xs text-muted-foreground">添加食材</span>
            )}
            {hiddenCount > 0 && <Badge variant="secondary">+{hiddenCount}</Badge>}
            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,640px)] p-3" onClick={(event) => event.stopPropagation()}>
        <RecipeIngredientEditor items={items} legacyText={legacyText} onSave={onSave} />
      </PopoverContent>
    </Popover>
  );
}
