'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Trash2, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface StandardSuggestion {
  standardItemId?: string;
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

type RunningMode = 'senses' | 'recipes' | null;
type AcceptingMode = 'senses' | 'recipes' | null;

export function AgentPresetPanel({
  taskId,
  onAccepted,
}: {
  taskId: string;
  onAccepted: (mode: Exclude<AcceptingMode, null>) => void;
}) {
  const [runningMode, setRunningMode] = useState<RunningMode>(null);
  const [acceptingMode, setAcceptingMode] = useState<AcceptingMode>(null);
  const [standardSuggestions, setStandardSuggestions] = useState<StandardSuggestion[]>([]);
  const [recipeSuggestions, setRecipeSuggestions] = useState<RecipeSuggestion[]>([]);
  const [expandedRecipes, setExpandedRecipes] = useState<string[]>([]);

  const runAgent = async (mode: Exclude<RunningMode, null>) => {
    setRunningMode(mode);
    try {
      const skillKeys = mode === 'senses' ? ['senses_standard_preset'] : ['recipe_scene_preset'];
      const res = await fetch(`/api/tasks/${taskId}/agent-presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_keys: skillKeys }),
      });
      if (!res.ok) {
        toast.error('AI体验方案生成请求失败，请检查网络或稍后重试');
        return;
      }
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || 'AI体验方案生成失败');
        return;
      }
      const nextResult = data.data as AgentPresetResponse;
      const warnings = (data.data as Record<string, unknown>)?.warnings as string[] | undefined;
      if (mode === 'senses') {
        setStandardSuggestions(nextResult.suggestions.standards || []);
        toast.success(warnings?.length ? `已生成，但有部分失败: ${warnings.join('; ')}` : 'AI五感体验建议已生成');
      } else {
        setRecipeSuggestions(nextResult.suggestions.recipes || []);
        setExpandedRecipes([]);
        toast.success(warnings?.length ? `已生成，但有部分失败: ${warnings.join('; ')}` : '食谱功能探索已生成');
      }
    } catch {
      toast.error('网络请求失败，请检查网络连接后重试');
    } finally {
      setRunningMode(null);
    }
  };

  const applyPreset = async (mode: Exclude<AcceptingMode, null>) => {
    const standards = mode === 'senses'
      ? standardSuggestions.map((item) => ({
          standard_item_id: item.standardItemId || '',
          standard_category: item.standardCategory || 'AI预设',
          reason: item.reason,
          focus: item.focus,
        }))
      : [];
    const recipes = mode === 'recipes'
      ? recipeSuggestions.map((item) => ({
          name: item.name,
          recipe_type: item.recipeType,
          ingredients: item.ingredients,
          steps: item.steps,
        }))
      : [];

    if (standards.length + recipes.length === 0) return;
    setAcceptingMode(mode);
    try {
      const res = await fetch(`/api/tasks/${taskId}/agent-presets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_suggestion', standards, recipes }),
      });
      if (!res.ok) {
        toast.error('写入草稿请求失败，请检查网络或稍后重试');
        return;
      }
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '写入草稿失败');
        return;
      }
      toast.success(mode === 'senses' ? '五感体验标准已预设' : '食谱/功能已预设');
      if (mode === 'senses') setStandardSuggestions([]);
      else setRecipeSuggestions([]);
      onAccepted(mode);
    } catch {
      toast.error('网络请求失败，请检查网络连接后重试');
    } finally {
      setAcceptingMode(null);
    }
  };

  const removeStandard = (key: string) => {
    setStandardSuggestions((current) => current.filter((item) => (item.standardItemId || item.focus) !== key));
  };

  const removeRecipe = (name: string) => {
    setRecipeSuggestions((current) => current.filter((item) => item.name !== name));
    setExpandedRecipes((current) => current.filter((item) => item !== name));
  };

  const toggleRecipe = (name: string) => {
    setExpandedRecipes((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WandSparkles className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">AI五感体验</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              依据体验目标、用户痛点和五感标准，生成本次重点检查指标。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => runAgent('senses')} disabled={runningMode !== null}>
              {runningMode === 'senses' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-1.5 h-4 w-4" />}
              AI五感体验
            </Button>
            <Button size="sm" onClick={() => applyPreset('senses')} disabled={acceptingMode !== null || standardSuggestions.length === 0}>
              {acceptingMode === 'senses' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              快速预设
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">重点检查指标</h3>
            <Badge variant="secondary">{standardSuggestions.length} 项</Badge>
          </div>
          {standardSuggestions.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
              点击“AI五感体验”后，这里会输出建议重点检查的五感指标。
            </div>
          ) : (
            <div className="space-y-2">
              {standardSuggestions.map((item) => (
                <div key={item.standardItemId || item.focus} className="rounded-md border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-sm font-medium">{item.focus || item.reason || item.standardItemId}</span>
                        {item.standardCategory && <Badge variant="outline" className="text-[10px]">{item.standardCategory}</Badge>}
                      </div>
                      <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                        {item.reason || 'AI推荐重点检查'}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeStandard(item.standardItemId || item.focus)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WandSparkles className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">食谱功能AI探索</h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              依据体验诉求、产品功能用途和趋势线索，生成可执行的功能/食谱草案。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => runAgent('recipes')} disabled={runningMode !== null}>
              {runningMode === 'recipes' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-1.5 h-4 w-4" />}
              食谱功能AI探索
            </Button>
            <Button size="sm" onClick={() => applyPreset('recipes')} disabled={acceptingMode !== null || recipeSuggestions.length === 0}>
              {acceptingMode === 'recipes' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              快速预设
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">功能/食谱建议</h3>
            <Badge variant="secondary">{recipeSuggestions.length} 项</Badge>
          </div>
          {recipeSuggestions.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
              点击“食谱功能AI探索”后，这里会输出功能名称、食材参数、推荐原因和步骤预览。
            </div>
          ) : (
            <div className="space-y-2">
              {recipeSuggestions.map((item) => {
                const expanded = expandedRecipes.includes(item.name);
                return (
                  <div key={item.name} className="rounded-md border bg-background p-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted/40"
                        onClick={() => toggleRecipe(item.name)}
                        aria-label={expanded ? '收起步骤' : '展开步骤'}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all text-sm font-medium">{item.name}</span>
                            <Badge variant="outline" className="text-[10px]">{item.recipeType || '食谱/功能'}</Badge>
                          </div>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{item.ingredients || '暂无食材/参数'}</p>
                        </div>
                        <p className="break-all text-xs leading-relaxed text-muted-foreground lg:border-l lg:pl-3">
                          {item.reason || 'AI推荐'}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeRecipe(item.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {expanded && (
                      <>
                        <Separator className="my-3" />
                        <div className="space-y-2 pl-10">
                          {item.steps.length === 0 ? (
                            <p className="text-xs text-muted-foreground">暂无步骤预览</p>
                          ) : (
                            item.steps.map((step, index) => (
                              <div key={`${item.name}-${index}`} className="flex gap-2 rounded-md bg-muted/30 p-2 text-xs">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                  {index + 1}
                                </span>
                                <span className={cn('min-w-0 flex-1 break-all', !step.operation && 'text-muted-foreground')}>
                                  {step.operation || '暂无操作说明'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
