'use client';

import { useState } from 'react';
import { Bot, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

interface StandardSuggestion {
  standardItemId: string;
  standardCategory?: string;
  reason: string;
  focus: string;
}

interface RecipeSuggestion {
  name: string;
  recipeType: string;
  ingredients: string;
  reason: string;
  steps: Array<{ operation: string }>;
}

interface AgentPresetResponse {
  intent: Record<string, unknown>;
  suggestions: {
    standards: StandardSuggestion[];
    recipes: RecipeSuggestion[];
  };
}

export function AgentPresetPanel({
  taskId,
  userId,
  onAccepted,
}: {
  taskId: string;
  userId?: string;
  onAccepted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<AgentPresetResponse | null>(null);
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);

  const runAgent = async (skillKeys: string[]) => {
    setRunning(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/agent-presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_keys: skillKeys, user_id: userId }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || 'Agent预设失败');
        return;
      }
      const nextResult = data.data as AgentPresetResponse;
      setResult(nextResult);
      setSelectedStandards(nextResult.suggestions.standards.map((item) => item.standardItemId));
      setSelectedRecipes(nextResult.suggestions.recipes.map((item) => item.name));
      toast.success('Agent预设建议已生成');
    } finally {
      setRunning(false);
    }
  };

  const acceptSelected = async () => {
    if (!result) return;
    setAccepting(true);
    try {
      const standards = result.suggestions.standards
        .filter((item) => selectedStandards.includes(item.standardItemId))
        .map((item) => ({ standard_item_id: item.standardItemId }));
      const recipes = result.suggestions.recipes
        .filter((item) => selectedRecipes.includes(item.name))
        .map((item) => ({
          name: item.name,
          recipe_type: item.recipeType,
          ingredients: item.ingredients,
          steps: item.steps,
        }));

      const res = await fetch(`/api/tasks/${taskId}/agent-presets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_suggestion', user_id: userId, standards, recipes }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '写入草稿失败');
        return;
      }
      toast.success('Agent建议已写入草稿');
      setOpen(false);
      onAccepted();
    } finally {
      setAccepting(false);
    }
  };

  const toggleStandard = (id: string) => {
    setSelectedStandards((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleRecipe = (name: string) => {
    setSelectedRecipes((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="min-w-0 sm:flex-none" onClick={() => setOpen(true)}>
        <Bot className="h-4 w-4 mr-1.5" /> Agent预设
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Agent预设建议
            </DialogTitle>
            <DialogDescription>选择建议后写入草稿，检查结果、问题描述和素材保持空白</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => runAgent(['senses_standard_preset'])} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}五感标准
            </Button>
            <Button variant="outline" size="sm" onClick={() => runAgent(['recipe_scene_preset'])} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}食谱/功能
            </Button>
            <Button size="sm" onClick={() => runAgent(['senses_standard_preset', 'recipe_scene_preset'])} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}一键运行
            </Button>
          </div>

          {result && (
            <div className="space-y-4">
              <Separator />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">五感体验检查项</h3>
                  <Badge variant="secondary">{selectedStandards.length}/{result.suggestions.standards.length}</Badge>
                </div>
                {result.suggestions.standards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无建议检查项</p>
                ) : (
                  <div className="space-y-2">
                    {result.suggestions.standards.map((item) => (
                      <label key={item.standardItemId} className="flex gap-3 rounded-md border p-3">
                        <Checkbox checked={selectedStandards.includes(item.standardItemId)} onCheckedChange={() => toggleStandard(item.standardItemId)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-all">{item.focus || item.standardItemId}</span>
                          <span className="block text-xs text-muted-foreground break-all">{item.reason || 'Agent推荐重点检查'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">食谱/功能场景</h3>
                  <Badge variant="secondary">{selectedRecipes.length}/{result.suggestions.recipes.length}</Badge>
                </div>
                {result.suggestions.recipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无建议食谱/功能</p>
                ) : (
                  <div className="space-y-2">
                    {result.suggestions.recipes.map((item) => (
                      <label key={item.name} className="flex gap-3 rounded-md border p-3">
                        <Checkbox checked={selectedRecipes.includes(item.name)} onCheckedChange={() => toggleRecipe(item.name)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-all">{item.name}</span>
                          <span className="block text-xs text-muted-foreground break-all">{item.ingredients || '未填写参数'}</span>
                          {item.reason && <span className="block text-xs text-muted-foreground break-all">{item.reason}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>

              <Button className="w-full gap-2" onClick={acceptSelected} disabled={accepting || (selectedStandards.length + selectedRecipes.length === 0)}>
                <CheckCircle2 className="h-4 w-4" /> {accepting ? '写入中...' : '写入所选草稿'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
