'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildRecipeIssuePayload,
  findRecipeIssue,
  type RecipeIssueSummary,
} from '@/lib/recipe-issue-output';
import type { ProblemPoint, Recipe } from '../types';
import { toast } from 'sonner';

type RecipeIssueOutputPanelProps = {
  taskId: string;
  productModel?: string | null;
  recipe: Recipe;
  problemPoints: ProblemPoint[];
  ensureDraftSaved: () => Promise<boolean>;
};

export function RecipeIssueOutputPanel({
  taskId,
  productModel,
  recipe,
  problemPoints,
  ensureDraftSaved,
}: RecipeIssueOutputPanelProps) {
  const [issues, setIssues] = useState<RecipeIssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingTitle, setCreatingTitle] = useState('');

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/issues?recipe_id=${encodeURIComponent(recipe.id)}&limit=200`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.code !== 0) throw new Error(result.message || '问题状态加载失败');
      setIssues(result.data?.list || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '问题状态加载失败');
    } finally {
      setLoading(false);
    }
  }, [recipe.id]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const createIssue = async (problem: ProblemPoint) => {
    const title = problem.text.trim();
    if (!title || creatingTitle) return;
    setCreatingTitle(title);
    try {
      const saved = await ensureDraftSaved();
      if (!saved) return;

      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecipeIssuePayload({ taskId, productModel, recipe, problem })),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.code !== 0) throw new Error(result.message || '问题登记失败');
      setIssues((current) => (
        current.some((issue) => issue.id === result.data.id) ? current : [result.data, ...current]
      ));
      toast.success(result.created === false ? '该问题已在问题管理中' : '已登记到问题管理');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '问题登记失败');
    } finally {
      setCreatingTitle('');
    }
  };

  const validProblems = problemPoints.filter((problem) => problem.text.trim());
  if (validProblems.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertCircle className="h-4 w-4 text-rose-600" />
        <span className="text-sm font-semibold">问题输出</span>
        <span className="text-xs text-muted-foreground">确认后进入问题管理，后续可分派、整改与复评。</span>
        {loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="space-y-2">
        {validProblems.map((problem, index) => {
          const existing = findRecipeIssue(issues, recipe.id, problem.text);
          const creating = creatingTitle === problem.text.trim();
          return (
            <div key={`${problem.text}-${index}`} className="flex flex-col gap-2 rounded-md border bg-background p-2.5 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">{problem.text.trim()}</p>
              {existing ? (
                <Badge variant="secondary" className="w-fit gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" />已进入问题管理
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  disabled={loading || Boolean(creatingTitle)}
                  onClick={() => void createIssue(problem)}
                >
                  {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  {creating ? '登记中' : '登记为问题'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
