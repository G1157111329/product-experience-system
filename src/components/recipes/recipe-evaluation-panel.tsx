'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { IssueRetestPanel } from '@/components/issues/issue-retest-panel';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { evaluationStatusLabel, normalizeEvaluationStatus, type EvaluationStatus } from '@/lib/evaluation-status';
import { materialSignature, shouldReportSaveError, shouldSyncExternalMaterials } from '@/lib/recipe-evaluation-state';

type RecipeEvaluation = {
  id: string;
  effect_status?: EvaluationStatus | null;
  effect_description?: string | null;
  effect_materials?: Material[];
};

type RecipeIssue = { id: string; status?: string | null };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function RecipeEvaluationPanel({
  taskId,
  recipe,
  onRecipeUpdated,
}: {
  taskId: string;
  recipe: RecipeEvaluation;
  onRecipeUpdated?: (patch: Partial<RecipeEvaluation>) => void;
}) {
  const recipeIdentity = useRef(recipe.id);
  recipeIdentity.current = recipe.id;
  const [status, setStatus] = useState<EvaluationStatus>(() => normalizeEvaluationStatus(recipe.effect_status));
  const [description, setDescription] = useState(recipe.effect_description || '');
  const [materialIds, setMaterialIds] = useState(() => (recipe.effect_materials || []).map((item) => item.id));
  const [materials, setMaterials] = useState<Material[]>(recipe.effect_materials || []);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [issue, setIssue] = useState<RecipeIssue | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const valuesRef = useRef({ status, description, materialIds, materials });
  valuesRef.current = { status, description, materialIds, materials };
  const saveChain = useRef(Promise.resolve());
  const saveGeneration = useRef(0);
  const materialSaveInFlight = useRef(0);
  const localMaterialsDirty = useRef(false);
  const draftGeneration = useRef(0);
  const disposedGeneration = useRef(0);
  const issueController = useRef<AbortController | null>(null);
  const aiController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);

  const invalidateAi = useCallback(() => {
    draftGeneration.current += 1;
    aiController.current?.abort();
    aiController.current = null;
    setAiLoading(false);
  }, []);

  const loadIssue = useCallback(async () => {
    issueController.current?.abort();
    const controller = new AbortController();
    issueController.current = controller;
    const targetRecipeId = recipe.id;
    try {
      const response = await fetch(`/api/issues?recipe_id=${encodeURIComponent(targetRecipeId)}&limit=1`, { signal: controller.signal });
      const payload = await response.json();
      if (controller.signal.aborted || recipeIdentity.current !== targetRecipeId) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || '问题状态加载失败');
      setIssue(payload.data?.list?.[0] || null);
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : '问题状态加载失败');
    }
  }, [recipe.id]);

  useEffect(() => {
    disposedGeneration.current += 1;
    saveGeneration.current += 1;
    void loadIssue();
    return () => {
      disposedGeneration.current += 1;
      saveGeneration.current += 1;
      draftGeneration.current += 1;
      issueController.current?.abort();
      aiController.current?.abort();
      saveController.current?.abort();
    };
  }, [loadIssue, recipe.id]);

  const externalMaterialSignature = materialSignature(recipe.effect_materials || []);
  useEffect(() => {
    const externalMaterials = recipe.effect_materials || [];
    if (!shouldSyncExternalMaterials({
      externalSignature: externalMaterialSignature,
      localSignature: materialSignature(valuesRef.current.materials),
      dirty: localMaterialsDirty.current,
      inFlight: materialSaveInFlight.current,
    })) return;
    const ids = externalMaterials.map((item) => item.id);
    setMaterialIds(ids);
    setMaterials(externalMaterials);
    valuesRef.current = { ...valuesRef.current, materialIds: ids, materials: externalMaterials };
  }, [externalMaterialSignature, recipe.effect_materials]);

  const queueSave = useCallback((
    overrides: Partial<{ status: EvaluationStatus; description: string; materialIds: string[]; materials: Material[] }> = {},
    options: { silent?: boolean } = {},
  ) => {
    const targetRecipeId = recipe.id;
    const generation = ++saveGeneration.current;
    const lifecycle = disposedGeneration.current;
    const snapshot = { ...valuesRef.current, ...overrides };
    setSaveState('saving');
    const operation = saveChain.current.catch(() => undefined).then(async () => {
      if (recipeIdentity.current !== targetRecipeId
        || disposedGeneration.current !== lifecycle
        || generation !== saveGeneration.current) return;
      const controller = new AbortController();
      saveController.current = controller;
      materialSaveInFlight.current += 1;
      let response: Response;
      try {
        response = await fetch(`/api/recipes/${targetRecipeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            effect_status: snapshot.status,
            effect_description: snapshot.description,
            effect_material_ids: snapshot.materialIds,
          }),
        });
      } finally {
        materialSaveInFlight.current -= 1;
        if (saveController.current === controller) saveController.current = null;
      }
      const payload = await response.json().catch(() => ({}));
      const current = recipeIdentity.current === targetRecipeId
        && disposedGeneration.current === lifecycle
        && generation === saveGeneration.current;
      if (!response.ok || payload.code !== 0) {
        if (current) setSaveState('error');
        throw new Error(payload.message || '效果评价保存失败');
      }
      if (!current) return;
      if (materialSignature(snapshot.materials) === materialSignature(valuesRef.current.materials)) {
        localMaterialsDirty.current = false;
      }
      setSaveState('saved');
      onRecipeUpdated?.({
        effect_status: snapshot.status,
        effect_description: snapshot.description,
        effect_materials: snapshot.materials,
      });
      await loadIssue();
    });
    saveChain.current = operation.catch((error) => {
      if (recipeIdentity.current === targetRecipeId
        && disposedGeneration.current === lifecycle
        && generation === saveGeneration.current
        && shouldReportSaveError(Boolean(options.silent))) {
        toast.error(error instanceof Error ? error.message : '效果评价保存失败');
      }
    });
    return operation;
  }, [loadIssue, onRecipeUpdated, recipe.id]);

  const chooseStatus = (next: EvaluationStatus) => {
    invalidateAi();
    setStatus(next);
    valuesRef.current = { ...valuesRef.current, status: next };
    void queueSave({ status: next });
  };

  const fillAiSummary = async () => {
    invalidateAi();
    const controller = new AbortController();
    const draftToken = ++draftGeneration.current;
    aiController.current = controller;
    const targetRecipeId = recipe.id;
    setAiLoading(true);
    try {
      await queueSave({}, { silent: true });
      if (controller.signal.aborted || recipeIdentity.current !== targetRecipeId || draftToken !== draftGeneration.current) return;
      const response = await fetch(`/api/recipes/${targetRecipeId}/ai-evaluate`, { method: 'POST', signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (controller.signal.aborted || recipeIdentity.current !== targetRecipeId || draftToken !== draftGeneration.current) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || 'AI评价失败');
      const summary = String(payload.data?.summary || '').trim();
      if (!summary) throw new Error('AI未返回评价文字');
      setDescription(summary);
      valuesRef.current = { ...valuesRef.current, description: summary };
      await queueSave({ description: summary }, { silent: true });
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : 'AI评价失败');
    } finally {
      if (aiController.current === controller) {
        aiController.current = null;
        setAiLoading(false);
      }
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm" aria-label="效果或出品评价">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">效果/出品评价</span>
        <span className={cn('text-[11px]', saveState === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
          {saveState === 'saving' && '保存中'}
          {saveState === 'saved' && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />已保存</span>}
          {saveState === 'error' && '保存失败'}
        </span>
      </div>

      <div role="radiogroup" aria-label="效果评价结果" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(['qualified', 'unqualified', 'pending'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            role="radio"
            aria-checked={status === value}
            variant={status === value ? 'default' : 'ghost'}
            size="sm"
            className="min-h-11"
            onClick={() => chooseStatus(value)}
          >
            {evaluationStatusLabel(value)}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`recipe-evaluation-${recipe.id}`} className="text-xs">评价描述</Label>
        <div className="relative">
          <Textarea
            id={`recipe-evaluation-${recipe.id}`}
            value={description}
            rows={4}
            className="pr-11"
            placeholder="描述该功能/食谱的出品效果、使用感受和关键观察..."
            onChange={(event) => {
              invalidateAi();
              setDescription(event.target.value);
              valuesRef.current = { ...valuesRef.current, description: event.target.value };
              setSaveState('idle');
            }}
            onBlur={() => void queueSave()}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="AI生成评价"
            title="AI生成评价"
            className="absolute bottom-1.5 right-1.5 h-8 w-8"
            disabled={aiLoading || (!description.trim() && materialIds.length === 0)}
            onClick={() => void fillAiSummary()}
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">效果素材</Label>
        <MaterialPicker
          taskId={taskId}
          selectedIds={materialIds}
          initialMaterials={materials}
          selectedPreviewSize="md"
          onSelectionChange={(ids, selected) => {
            invalidateAi();
            localMaterialsDirty.current = true;
            setMaterialIds(ids);
            setMaterials(selected);
            valuesRef.current = { ...valuesRef.current, materialIds: ids, materials: selected };
            void queueSave({ materialIds: ids, materials: selected });
          }}
        />
      </div>

      {saveState === 'error' && (
        <Button type="button" variant="outline" size="sm" onClick={() => void queueSave()}>重试保存</Button>
      )}

      {issue && (
        <IssueRetestPanel
          key={`${recipe.id}:${issue.id}`}
          issueId={issue.id}
          taskId={taskId}
          onIssueUpdated={(updated) => {
            if (typeof updated.id === 'string') setIssue({ id: updated.id, status: typeof updated.status === 'string' ? updated.status : null });
          }}
        />
      )}
    </section>
  );
}
