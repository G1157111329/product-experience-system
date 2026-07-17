'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PresignedImage, PresignedVideo } from '@/components/presigned-media';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightLeft, FileText, Eye, Package, Plus, Camera, Video, Film, Image as ImageIcon, Pencil, Trash2, Check, Play, Sparkles, Save, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Material, CheckRecord, Issue, Recipe, RecipeStep } from './types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useImagePreview } from '@/components/image-preview';
import { MaterialPicker } from '@/components/material-picker';
import { MediaCaptureDialog } from '@/components/media-capture-dialog';
import { ImageEditorDialog, type SaveMode } from '@/components/image-editor-dialog';
import { PageShell } from '@/components/app';
import { MediaGallery } from '@/components/app/media-gallery';
import { buildReportReadiness } from '@/lib/report-readiness';
import { hasMaterialSelectionChanged, shouldCloseSensesDraftWithoutSaving } from '@/lib/senses-draft-autosave';
import { formatAiSummaryText, parseAiSummaryText } from '@/lib/report-content-rules';
import { waitForPendingInlineSavesOrThrow } from '@/lib/inline-save-registry';
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';
import { RecipeEvaluationPanel } from '@/components/recipes/recipe-evaluation-panel';
import { MaterialEvidenceRail } from './components/material-evidence-rail';
import { ReportAuthoringShell } from './components/report-authoring-shell';
import { SensesInputWorkspace } from './components/senses-input-workspace';
import { FunctionsInputWorkspace } from './components/functions-input-workspace';
import { ComparisonWorkspace } from './components/comparison-workspace';
import { MatrixTab } from './components/matrix-tab';
import { BasicInfoTab as BasicInfoTabView } from './components/basic-info-tab';
import { TaskAuthoringHeader } from './components/task-authoring-header';
import { type IngredientDraftItem } from './components/recipe-ingredient-editor';
import type { EvidenceBindingTarget } from './types';
import { hasMeaningfulActiveComparison, hasMeaningfulActiveMatrix } from '@/lib/matrix/task-header-status';
import { sortCreatedAscending } from '@/lib/stable-display-order';
import { DeletionImpactDialog } from '@/components/deletion-impact-dialog';
import { loadDeletionImpact } from '@/lib/deletion-impact-ui';
import { useDeletionFlowController } from '@/hooks/use-deletion-flow-controller';
import { assertSuccessfulSortResponse, persistOptimisticSort } from '@/lib/persisted-sort';
import { withActiveTabSearch } from '@/lib/tab-url-state';

/* ─── Types ─── */
interface RecipeLibRef {
  id: string; name: string; product_category: string | null; product: string | null;
  ingredients: string | null; recipe_type: string;
  recipe_library_steps: Array<{ id: string; step_number: number; operation: string; problem_point: string | null; problem_points: unknown }>;
}

interface TaskDetail {
  id: string; task_name: string; product_category: string; product: string | null; product_model: string; project_number: string | null;
  project_type: string | null; project_phase: string | null; test_date: string | null; organizer: string | null;
  target_user: string | null; test_purpose: string | null; test_method: string | null;
  task_mode?: 'single' | 'comparison' | string | null; comparison_intent?: string | null; comparison_layout_type?: string | null;
  status: string; assigned_to: string | null; created_by: string | null; created_at: string;
  records: CheckRecord[]; issues: Issue[];
}

interface AiTaskSummary {
  tag: string;
  summary: string;
  strengths: string[];
  risks: string[];
  historical_position: string;
  suggestions: string[];
  updated_at?: string;
}

const sensoryColors: Record<string, string> = {
  '视觉': 'bg-primary/10 text-primary',
  '听觉': 'bg-yellow-100 text-yellow-800',
  '触觉': 'bg-orange-100 text-orange-800',
  '嗅觉': 'bg-lime-100 text-lime-800',
  '味觉': 'bg-rose-100 text-rose-800',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '已完成': { label: '已完成', color: 'bg-primary text-primary-foreground' },
};

function summaryToForm(summary: AiTaskSummary) {
  return { text: formatAiSummaryText(summary) };
}

type TaskDetailTab = 'info' | 'materials' | 'senses' | 'functions' | 'comparison' | 'matrix';

function isTaskDetailTab(value: string | null): value is TaskDetailTab {
  return value === 'info' || value === 'materials' || value === 'senses' || value === 'functions' || value === 'comparison' || value === 'matrix';
}

async function loadRecipesForTask(taskId: string): Promise<Recipe[]> {
  const res = await fetch(`/api/recipes?task_id=${taskId}`);
  const data = await res.json();
  if (data.code !== 0) return [];

  const recipesData: Recipe[] = data.data || [];
  const seen = new Set<string>();
  const deduped = recipesData.filter((recipe) => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return true;
  });

  return Promise.all(
    deduped.map(async (recipe) => {
      const stepsWithMats = await Promise.all(
        (recipe.recipe_steps || []).map(async (step) => {
          try {
            const matRes = await fetch(`/api/materials?recipe_step_id=${step.id}`);
            const matData = await matRes.json();
            return { ...step, materials: matData.code === 0 ? matData.data || [] : [] };
          } catch {
            return { ...step, materials: [] };
          }
        })
      );

      let effectMaterials: Material[] = [];
      try {
        const effectMatRes = await fetch(`/api/materials?recipe_id=${recipe.id}`);
        const effectMatData = await effectMatRes.json();
        effectMaterials = effectMatData.code === 0 ? effectMatData.data || [] : [];
      } catch {
        effectMaterials = [];
      }
      return {
        ...recipe,
        recipe_steps: stepsWithMats,
        effect_materials: effectMaterials,
      };
    })
  );
}

/* ─── Main Page ─── */
export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedRecordId = searchParams.get('record_id') || undefined;
  const focusedRecipeId = searchParams.get('recipe_id') || undefined;
  const focusedRecipeStepId = searchParams.get('recipe_step_id') || undefined;
  const { isAdmin } = useAuth();
  const id = params.id as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TaskDetailTab>(() => {
    const requestedTab = searchParams.get('tab');
    return isTaskDetailTab(requestedTab) ? requestedTab : 'info';
  });
  const unsavedNavigation = useUnsavedNavigationGuard();
  const { attemptNavigation } = unsavedNavigation;
  const persistActiveTab = useCallback((section: TaskDetailTab) => {
    if (typeof window === 'undefined') return;
    const search = withActiveTabSearch(window.location.search, section);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${search}`);
  }, []);
  const changeActiveTab = useCallback((section: TaskDetailTab) => {
    void attemptNavigation(() => {
      setActiveTab(section);
      persistActiveTab(section);
    });
  }, [attemptNavigation, persistActiveTab]);
  const [evidenceBindingTarget, setEvidenceBindingTarget] = useState<EvidenceBindingTarget | null>(null);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: string; name: string; account: string }>>([]);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiTaskSummary | null>(null);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [aiSummarySaving, setAiSummarySaving] = useState(false);
  const [reportRecipes, setReportRecipes] = useState<Recipe[]>([]);
  // Track whether recipes have been loaded at least once, so switching to the
  // functions tab doesn't re-fetch all materials on every visit. A re-fetch is
  // still triggered explicitly by handleMaterialsChanged / handleAgentAccepted
  // when data actually changes.
  const recipesLoadedRef = useRef(false);
  const [summaryForm, setSummaryForm] = useState({ text: '' });

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`);
    const data = await res.json();
    if (data.code === 0) setTask(data.data);
  }, [id]);

  const fetchAiSummary = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}/ai-summary`);
    const data = await res.json();
    if (data.code === 0 && data.data) {
      setAiSummary(data.data);
      setSummaryForm(summaryToForm(data.data));
    }
  }, [id]);

  const fetchReportRecipes = useCallback(async () => {
    setReportRecipes(await loadRecipesForTask(id));
    recipesLoadedRef.current = true;
  }, [id]);

  const handleMaterialsChanged = useCallback(() => {
    fetchTask();
    fetchReportRecipes();
  }, [fetchReportRecipes, fetchTask]);

  useEffect(() => { fetchTask().finally(() => setLoading(false)); }, [fetchTask]);
  useEffect(() => { fetchAiSummary(); }, [fetchAiSummary]);
  useEffect(() => { fetchReportRecipes(); }, [fetchReportRecipes]);
  useEffect(() => {
    // Only auto-fetch when entering the functions tab if recipes haven't been
    // loaded yet. Subsequent tab switches reuse cached data; explicit refreshes
    // (handleMaterialsChanged) invalidates via re-fetch.
    if (activeTab === 'functions' && !recipesLoadedRef.current) fetchReportRecipes();
  }, [activeTab, fetchReportRecipes]);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (isTaskDetailTab(tab)) setActiveTab(tab);
  }, [searchParams]);
  const [hasMatrixInstance, setHasMatrixInstance] = useState(false);
  const [hasComparisonInstance, setHasComparisonInstance] = useState(false);
  const refreshMatrixHeaderStatus = useCallback(async () => {
    try {
      const matrixResponse = await fetch(`/api/v1/tasks/${id}/matrix-tab-state`, { cache: 'no-store' });
      const matrixJson = await matrixResponse.json();
      const matrixData = matrixJson.data ?? matrixJson;
      setHasMatrixInstance(hasMeaningfulActiveMatrix(Array.isArray(matrixData.matrices) ? matrixData.matrices : []));
    } catch {
      setHasMatrixInstance(false);
    }

    try {
      const assemblyResponse = await fetch(`/api/tasks/${id}/comparison/init`, { cache: 'no-store' });
      const assemblyJson = await assemblyResponse.json();
      const assemblyId = assemblyJson.code === 0 ? assemblyJson.data?.id : null;
      if (!assemblyId) {
        setHasComparisonInstance(false);
        return;
      }
      const comparisonResponse = await fetch(`/api/comparison-matrix?assembly_id=${encodeURIComponent(assemblyId)}`, { cache: 'no-store' });
      const comparisonJson = await comparisonResponse.json();
      setHasComparisonInstance(comparisonJson.code === 0 && hasMeaningfulActiveComparison(comparisonJson.data));
    } catch {
      setHasComparisonInstance(false);
    }
  }, [id]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${id}/matrices`, { cache: 'no-store' });
        const json = await res.json();
        void json;
      } catch { /* ignore — tab just won't show */ }
    })();
  }, [id]);
  useEffect(() => {
    void refreshMatrixHeaderStatus();
  }, [refreshMatrixHeaderStatus]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${id}/comparison/init`, { cache: 'no-store' });
        const json = await res.json();
        void json;
      } catch { /* ignore — card remains in its actual unavailable state */ }
    })();
  }, [id]);
  useEffect(() => {
    setEvidenceBindingTarget(null);
  }, [activeTab]);

  const reportReadiness = useMemo(() => {
    if (!task) return null;
    return buildReportReadiness({
      task,
      records: task.records || [],
      recipes: reportRecipes,
      aiSummary,
    });
  }, [task, reportRecipes, aiSummary]);

  // Transfer task to another user
  const handleTransfer = async () => {
    if (!transferTargetId || transferring) return;
    let saveGatePassed = false;
    await attemptNavigation(() => { saveGatePassed = true; });
    if (!saveGatePassed) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/tasks/${id}/transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: transferTargetId }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        setTransferOpen(false);
        router.push('/tasks');
      } else toast.error(data.message);
    } finally { setTransferring(false); }
  };

  const handleOpenTransfer = async () => {
    const res = await fetch('/api/auth/users');
    const data = await res.json();
    if (data.code === 0) {
      setTransferUsers((data.data || []).filter((u: Record<string, unknown>) => u.id !== task?.created_by));
      setTransferTargetId('');
      setTransferOpen(true);
    } else {
      toast.error(data.message || '获取用户列表失败');
    }
  };

  // Auto-update task status based on content changes
  const updateTaskStatusIfNeeded = async (action: 'add_content' | 'edit_completed') => {
    if (!task) return;
    let newStatus = '';
    if (action === 'add_content' && task.status === '待执行') {
      newStatus = '进行中';
    } else if (action === 'edit_completed' && task.status === '已完成') {
      newStatus = '进行中';
    }
    if (newStatus) {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTask(); // Refresh task data
    }
  };

  const [generatingReport, setGeneratingReport] = useState(false);

  const handleRequestGenerateReport = () => {
    setGenerateConfirmOpen(true);
  };

  const handleGenerateReport = async () => {
    if (generatingReport) return; // Prevent double-click
    setGenerateConfirmOpen(false);
    setGeneratingReport(true);
    try {
      window.dispatchEvent(new Event('inline-save:flush'));
      await waitForPendingInlineSavesOrThrow();
      const res = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id }),
      });
      const data = await res.json();
      if (data.code === 0) {
        // Update task status to 已完成
        await fetch(`/api/tasks/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '已完成' }),
        });
        toast.success('报告生成成功，任务已标记为已完成');
        await attemptNavigation(() => router.push('/reports'));
      } else {
        toast.error(data.message || '报告生成失败');
      }
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : '保存失败，报告未生成');
    } finally {
      setGeneratingReport(false);
    }
  };

  const openAiSummaryDialog = () => {
    if (aiSummary) setSummaryForm(summaryToForm(aiSummary));
    setAiSummaryOpen(true);
  };

  const handleGenerateAiSummary = async () => {
    if (aiSummarizing) return;
    setAiSummarizing(true);
    try {
      const res = await fetch(`/api/tasks/${id}/ai-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.code === 0) {
        setAiSummary(data.data);
        setSummaryForm(summaryToForm(data.data));
        setAiSummaryOpen(true);
        toast.success('AI总结已生成');
      } else {
        toast.error(data.message || 'AI总结失败');
      }
    } finally {
      setAiSummarizing(false);
    }
  };

  const handleSaveAiSummary = async () => {
    setAiSummarySaving(true);
    try {
      const payload: AiTaskSummary = {
        ...parseAiSummaryText(summaryForm.text, aiSummary || {
          tag: '',
          summary: '',
          strengths: [],
          risks: [],
          historical_position: '',
          suggestions: [],
        }),
        updated_at: new Date().toISOString(),
      };
      const res = await fetch(`/api/tasks/${id}/ai-summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: payload }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setAiSummary(data.data);
        setAiSummaryOpen(false);
        toast.success('AI总结已保存');
      } else {
        toast.error(data.message || '保存失败');
      }
    } finally {
      setAiSummarySaving(false);
    }
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!task) return <div className="p-6">任务不存在</div>;

  return (
    <PageShell size="wide" className="space-y-4">
      <TaskAuthoringHeader
        title={task.task_name}
        metadata={[task.product_model, task.project_number, task.product_category, task.product, task.project_type, task.project_phase].filter(Boolean).join(' | ')}
        statusLabel={statusConfig[task.status]?.label || task.status}
        statusClassName={cn('text-xs', statusConfig[task.status]?.color)}
        issueCount={task.issues?.length || 0}
        recipeCount={reportRecipes.length}
        sensesCount={task.records?.length || 0}
        hasMatrixInstance={hasMatrixInstance}
        hasComparisonInstance={hasComparisonInstance}
        hasAiSummary={Boolean(aiSummary)}
        generatingReport={generatingReport}
        summarizing={aiSummarizing}
        onBack={() => void unsavedNavigation.attemptBackNavigation()}
        onGenerateSummary={aiSummary ? openAiSummaryDialog : handleGenerateAiSummary}
        onGenerateReport={handleRequestGenerateReport}
        onOpenSection={changeActiveTab}
        transferAction={isAdmin ? (
          <Button variant="outline" size="sm" className="w-full min-w-0 sm:w-auto" onClick={handleOpenTransfer}>
            <ArrowRightLeft className="mr-1.5 h-4 w-4" /> 转移
          </Button>
        ) : undefined}
      />

      <ReportAuthoringShell
        activeTab={activeTab}
        onTabChange={changeActiveTab}
        hasMatrixInstance={hasMatrixInstance}
        materialRail={(activeTab === 'senses' || activeTab === 'functions' || activeTab === 'comparison' || activeTab === 'matrix') ? (
          <MaterialEvidenceRail
            taskId={id}
            bindingTarget={evidenceBindingTarget}
            onMaterialsChange={handleMaterialsChanged}
            embedded
          />
        ) : null}
      >

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <BasicInfoTabView task={task} onRefresh={fetchTask} />
          <AiSummaryContent aiSummary={aiSummary} onOpenAiSummary={openAiSummaryDialog} />
        </div>
      )}
      {activeTab === 'materials' && <MaterialsTab taskId={id} />}
        {activeTab === 'comparison' && (
          <ComparisonWorkspace taskId={id} taskName={task.task_name} initialLayoutType={task.comparison_layout_type} onMeaningfulContentChange={setHasComparisonInstance} attemptNavigation={attemptNavigation} />
        )}
        {activeTab === 'matrix' && (
          <MatrixTab taskId={id} taskName={task.task_name} attemptNavigation={attemptNavigation} onMeaningfulContentChange={refreshMatrixHeaderStatus} />
        )}
        {activeTab === 'senses' && <SensesTab taskId={id} records={task.records || []} focusedRecordId={focusedRecordId} taskProductCategory={task.product_category} taskProduct={task.product} onRefresh={fetchTask} onStatusUpdate={() => updateTaskStatusIfNeeded('add_content')} onBindingTargetChange={setEvidenceBindingTarget} attemptNavigation={attemptNavigation} />}
        {activeTab === 'functions' && <FunctionsTab taskId={id} initialRecipes={reportRecipes} focusedRecipeId={focusedRecipeId} focusedRecipeStepId={focusedRecipeStepId} onStatusUpdate={() => updateTaskStatusIfNeeded('add_content')} onRecipesChange={setReportRecipes} onBindingTargetChange={setEvidenceBindingTarget} attemptNavigation={attemptNavigation} />}
      </ReportAuthoringShell>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转移体验计划</DialogTitle>
            <DialogDescription>将该体验计划及其所有资料转移到其他用户</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground">转移后，该体验计划将从当前归属用户列表中移除，目标用户将获得所有资料的所有权</p>
            </div>
            <div className="space-y-1.5">
              <Label>选择目标用户</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger><SelectValue placeholder="请选择用户" /></SelectTrigger>
                <SelectContent>
                  {transferUsers.map((u: { id: string; name: string; account: string }) => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.account}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleTransfer} className="w-full" disabled={!transferTargetId || transferring}>
              {transferring ? '转移中...' : '确认转移'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={generateConfirmOpen} onOpenChange={setGenerateConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>生成报告前确认</DialogTitle>
            <DialogDescription>
              系统会从当前任务源数据生成报告事实快照。报告生成后，标题、总评、风险和建议可在报告详情页继续润色。
            </DialogDescription>
          </DialogHeader>
          {reportReadiness && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">生成前确认</p>
                    <p className="text-xs text-muted-foreground">
                      {reportReadiness.status === 'ready' ? '关键输入已完整，可以生成报告。' : '仍有输入缺口，建议先补齐再生成。'}
                    </p>
                  </div>
                  <Badge variant={reportReadiness.status === 'ready' ? 'default' : reportReadiness.status === 'attention' ? 'secondary' : 'destructive'}>
                    {reportReadiness.status === 'ready' ? '可生成' : reportReadiness.status === 'attention' ? '需确认' : '待补充'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {reportReadiness.items.filter((item) => item.status !== 'ok').slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-md border bg-background p-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => {
                      const targetTab = item.id.includes('recipe') || item.id.includes('raw-json') ? 'functions' : item.id.includes('record') ? 'senses' : 'info';
                      changeActiveTab(targetTab);
                      setGenerateConfirmOpen(false);
                    }}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setGenerateConfirmOpen(false)}>继续补充</Button>
                <Button onClick={handleGenerateReport} disabled={generatingReport}>
                  <FileText className="mr-1.5 h-4 w-4" />
                  {generatingReport ? '生成中...' : '确认生成报告'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={unsavedNavigation.isPromptOpen}
        onOpenChange={(open) => {
          if (!open) unsavedNavigation.cancelDiscard();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>内容尚未保存</DialogTitle>
            <DialogDescription>
              {unsavedNavigation.errorMessage || '保存失败，请重试；仅在确认不保留修改时选择放弃。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="destructive" onClick={unsavedNavigation.confirmDiscard}>放弃未保存修改</Button>
            <Button onClick={() => void unsavedNavigation.retryNavigation()}>重试保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Summary Dialog */}
      <Dialog open={aiSummaryOpen} onOpenChange={setAiSummaryOpen}>
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
                onChange={(e) => setSummaryForm({ text: e.target.value })}
                placeholder={'总结：\n满意度：\n主要优势：\n主要风险：\n历史表现：\n后续建议：'}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={handleGenerateAiSummary} disabled={aiSummarizing}>
                <Sparkles className="h-4 w-4 mr-1.5" /> {aiSummarizing ? '重新总结中...' : '重新AI总结'}
              </Button>
              <Button onClick={handleSaveAiSummary} disabled={aiSummarySaving}>
                <Save className="h-4 w-4 mr-1.5" /> {aiSummarySaving ? '保存中...' : '保存总结'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

/* ─── Tab: 基本信息 ─── */
function AiSummaryContent({
  aiSummary,
  onOpenAiSummary,
}: {
  aiSummary: AiTaskSummary | null;
  onOpenAiSummary: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          AI总结
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiSummary ? (
          <button
            type="button"
            onClick={onOpenAiSummary}
            className="w-full rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="text-xs">{aiSummary.tag || 'AI总结'}</Badge>
              <span className="basis-full text-xs text-muted-foreground line-clamp-2 sm:basis-auto sm:flex-1">
                {aiSummary.summary || '点击查看和编辑AI总结'}
              </span>
              <Pencil className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </button>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            尚未生成AI总结。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialsTab({ taskId }: { taskId: string }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingImage, setEditingImage] = useState<{ id: string; url: string; name: string } | null>(null);
  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement>(null);
  const { open, PreviewComponent } = useImagePreview();

  const fetchMaterials = useCallback(async () => {
    const res = await fetch(`/api/materials?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) setMaterials(data.data || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const handleUpload = async (files: File[] | FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        if (file.size > 100 * 1024 * 1024) { toast.error(`${file.name} 超过100MB`); continue; }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        toast.loading(`正在上传 ${file.name}...`, { id: `upload-${file.name}` });
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout for large files
          const res = await fetch('/api/materials/upload', { method: 'POST', body: formData, signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (data.code === 0) toast.success(`${file.name} 上传成功`, { id: `upload-${file.name}` });
          else toast.error(data.message, { id: `upload-${file.name}` });
        } catch (err) {
          const msg = err instanceof DOMException && err.name === 'AbortError' ? '上传超时，请重试' : '上传失败';
          toast.error(msg, { id: `upload-${file.name}` });
        }
      }
      fetchMaterials();
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (id: string) => {
    const res = await fetch('/api/materials', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, file_name: editName }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('重命名成功');
      setEditingId(null);
      fetchMaterials();
    }
  };

  const handleEditImageSave = async (editedFile: File, mode: SaveMode) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', editedFile);
      const overwrite = mode === 'overwrite' && Boolean(editingImage?.id);
      if (!overwrite) {
        formData.append('task_id', taskId);
        if (editingImage?.name) formData.append('copy_source_file_name', editingImage.name);
      }
      const res = await fetch(
        overwrite ? `/api/materials/${editingImage!.id}/replace` : '/api/materials/upload',
        { method: 'POST', body: formData },
      );
      const data = await res.json();
      if (data.code === 0) {
        toast.success(overwrite ? '图片已覆盖保存，原关联保持不变' : '编辑副本已保存');
        fetchMaterials();
      } else if (overwrite && res.status === 409 && data.save_mode === 'save_new') {
        const copyData = new FormData();
        copyData.append('file', editedFile);
        copyData.append('task_id', taskId);
        if (editingImage?.name) copyData.append('copy_source_file_name', editingImage.name);
        const copyResponse = await fetch('/api/materials/upload', { method: 'POST', body: copyData });
        const copyPayload = await copyResponse.json().catch(() => ({}));
        if (!copyResponse.ok || copyPayload.code !== 0) throw new Error(copyPayload.message || '另存编辑副本失败');
        toast.info('原图已被冻结报告引用，已另存为新图片');
        fetchMaterials();
      } else {
        toast.error(data.message || '保存失败');
      }
    } catch {
      toast.error('保存编辑图片失败');
    } finally {
      setUploading(false);
      setEditingImage(null);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/materials?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { toast.success('已删除'); fetchMaterials(); }
  };

  const images = materials.filter(m => m.material_type === 'image');
  const videos = materials.filter(m => m.material_type === 'video');

  return (
    <div className="space-y-4">
      <PreviewComponent />
      {/* Upload buttons */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="outline" size="sm" className="justify-center" onClick={() => setCaptureMode('image')} disabled={uploading}>
          <Camera className="h-4 w-4 mr-1.5" /> 拍照
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => setCaptureMode('video')} disabled={uploading}>
          <Video className="h-4 w-4 mr-1.5" /> 录像
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => galleryImageInputRef.current?.click()} disabled={uploading}>
          <ImageIcon className="h-4 w-4 mr-1.5" /> 相册图片
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => galleryVideoInputRef.current?.click()} disabled={uploading}>
          <Film className="h-4 w-4 mr-1.5" /> 相册视频
        </Button>
      </div>
      <input ref={galleryImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { await handleUpload(e.target.files); e.target.value = ''; }} />
      <input ref={galleryVideoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (e) => { await handleUpload(e.target.files); e.target.value = ''; }} />
      <MediaCaptureDialog
        mode={captureMode || 'image'}
        open={captureMode !== null}
        onOpenChange={(open) => setCaptureMode(open ? (captureMode || 'image') : null)}
        onCapture={(file) => handleUpload([file])}
        busy={uploading}
      />
      <ImageEditorDialog
        open={editingImage !== null}
        onOpenChange={(open) => { if (!open) setEditingImage(null); }}
        imageUrl={editingImage?.url || ''}
        fileName={editingImage?.name || 'image'}
        onSave={handleEditImageSave}
      />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[1,2,3].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />)}</div>
      ) : materials.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">素材仓库为空</p>
          <p className="text-xs text-muted-foreground mt-1">上传图片或视频开始使用</p>
        </CardContent></Card>
      ) : (
        <>
          {images.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">图片 ({images.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {images.map((mat) => (
                  <div key={mat.id} className="group relative rounded-lg overflow-hidden bg-muted border border-border">
                    <div
                      className="aspect-square cursor-pointer"
                      onClick={() => open(mat.file_path || mat.file_url, {
                        onEdit: (resolvedUrl) => setEditingImage({ id: mat.id, url: resolvedUrl, name: mat.file_name }),
                      })}
                    >
                      <PresignedImage filePath={mat.file_path || mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input
                            className="h-6 text-xs bg-white/90 border-0"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)}
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-white truncate flex-1">{mat.file_name}</p>
                          <div className="flex gap-0.5 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingImage({ id: mat.id, url: mat.file_url, name: mat.file_name }); }} className="p-0.5 text-white/70 hover:text-white">
                              <Crop className="h-3 w-3" />
                            </button>
                            <button onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }} className="p-0.5 text-white/70 hover:text-white">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDelete(mat.id)} className="p-0.5 text-white/70 hover:text-white">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {videos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">视频 ({videos.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {videos.map((mat) => (
                  <div key={mat.id} className="group relative rounded-lg overflow-hidden bg-muted border border-border">
                    <div className="aspect-video cursor-pointer" onClick={() => open(mat.file_path || mat.file_url)}>
                      <PresignedVideo filePath={mat.file_path || mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input className="h-6 text-xs bg-background/90" value={editName} onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)} autoFocus />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white hover:text-white" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-white truncate">{mat.file_name}</p>
                      )}
                    </div>
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/40 text-white hover:text-white hover:bg-black/60" onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/40 text-white hover:text-white hover:bg-black/60" onClick={() => handleDelete(mat.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Tab: 五感体验 ─── */
interface StandardItem {
  id: string;
  standard_id: string;
  sensory_dimension: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  check_standard: string | null;
  experience_standard: string | null;
  check_tool: string | null;
  problem_level: string | null;
  evaluation_prep: string | null;
  subjective_score: number | null;
  subjective_rating: string | null;
  standard: { id: string; standard_name: string; category: string; product_category: string | null } | null;
}

// Default options (used as fallback when DB settings not available)
const defaultPhaseOptions = ['开箱', '首次安装', '产品使用', '清洁收纳', '其他'];
const defaultSensoryOptions = ['视觉', '听觉', '触觉', '嗅觉', '味觉'];
const defaultFlowByPhase: Record<string, string[]> = {
  '开箱': ['拿取外包装', '拆开内包装'],
  '首次安装': ['配件梳理', '外观美观', '外观缺陷', '标识文字', '首次安装'],
  '产品使用': ['放置及组装', '操作交互', '产品运行'],
  '清洁收纳': ['冲水', '擦拭', '晾干', '收纳'],
  '其他': ['其他'],
};
const standardCategoryOptions = ['通用标准', '品类标准', '感官评价标准', '非标准'];

function SensesTab({ taskId, records, focusedRecordId, taskProductCategory, taskProduct, onRefresh, onStatusUpdate, onBindingTargetChange, attemptNavigation }: { taskId: string; records: CheckRecord[]; focusedRecordId?: string; taskProductCategory?: string; taskProduct?: string | null; onRefresh: () => void; onStatusUpdate: () => void; onBindingTargetChange?: (target: EvidenceBindingTarget | null) => void; attemptNavigation: (next: () => void) => Promise<void> }) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const selectedMaterialIdsRef = useRef<string[]>([]);
  const sensesDraftDirtyRef = useRef(false);
  const sensesSaveInFlightRef = useRef<Promise<boolean> | null>(null);
  const [, setSelectedMaterials] = useState<Material[]>([]);
  const [initialMaterialIds, setInitialMaterialIds] = useState<string[]>([]);
  const [recordMaterials, setRecordMaterials] = useState<Record<string, Material[]>>({});
  const [recordPatches, setRecordPatches] = useState<Record<string, Partial<CheckRecord>>>({});
  const { open, PreviewComponent } = useImagePreview();

  const displayRecords = useMemo(
    () => sortCreatedAscending(records.map((record) => ({ ...record, ...(recordPatches[record.id] || {}) }))),
    [records, recordPatches],
  );
  // ── Edit mode ──
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [editRecordData, setEditRecordData] = useState<CheckRecord | null>(null);
  const editRecordIdRef = useRef<string | null>(null);
  const editRecordDataRef = useRef<CheckRecord | null>(null);

  // ── Dynamic options from platform_settings ──
  const [phaseOptions, setPhaseOptions] = useState<string[]>(defaultPhaseOptions);
  const [flowByPhase, setFlowByPhase] = useState<Record<string, string[]>>(defaultFlowByPhase);
  const [sensoryOptions, setSensoryOptions] = useState<string[]>(defaultSensoryOptions);

  useEffect(() => {
    fetch('/api/settings?key=standard_options').then(r => r.json()).then(d => {
      if (d.code === 0 && d.data && (d.data.test_phases?.length > 0 || d.data.sensory_dimensions?.length > 0)) {
        setPhaseOptions(d.data.test_phases || defaultPhaseOptions);
        setFlowByPhase(d.data.experience_flows || defaultFlowByPhase);
        setSensoryOptions(d.data.sensory_dimensions || defaultSensoryOptions);
      }
    }).catch(() => {});
  }, []);

  // Standard type selection
  const [formCategory, setFormCategory] = useState('通用标准');

  // ── 通用标准 form ──
  const [generalForm, setGeneralForm] = useState({ test_phase: '', experience_flow: '', sensory_dimension: '', selectedItemId: '', problem_description: '' });
  const [generalItems, setGeneralItems] = useState<StandardItem[]>([]);

  // ── 品类标准 form ──
  const [categoryForm, setCategoryForm] = useState({ sensory_dimension: '', check_dimension: '', sub_check_dimension: '', selectedItemId: '', problem_description: '' });
  const [categoryDimensions, setCategoryDimensions] = useState<string[]>([]);
  const [categorySubDimensions, setCategorySubDimensions] = useState<string[]>([]);
  const [categoryItems, setCategoryItems] = useState<StandardItem[]>([]);

  // ── 感官评价标准 form ──
  const [sensoryForm, setSensoryForm] = useState({ sensory_dimension: '', score: '', result_description: '' });
  const [sensoryRefItems, setSensoryRefItems] = useState<StandardItem[]>([]);
  const [evaluationResult, setEvaluationResult] = useState('待定');

  // ── 非标准 form ──
  const [nonStandardForm, setNonStandardForm] = useState({ description: '', problem_description: '' });

  // ── Fuzzy search ──
  const [fuzzyKeyword, setFuzzyKeyword] = useState('');
  const [fuzzyResults, setFuzzyResults] = useState<StandardItem[]>([]);
  const [fuzzyLoading, setFuzzyLoading] = useState(false);

  // ── Record status edit dialog ──

  // ── 通用标准: fetch matching items when 3 selects are chosen ──
  useEffect(() => {
    if (formCategory !== '通用标准') return;
    if (!generalForm.test_phase || !generalForm.experience_flow || !generalForm.sensory_dimension) {
      setGeneralItems([]);
      return;
    }
    const fetchItems = async () => {
      const params = new URLSearchParams();
      params.set('category', '通用标准');
      params.set('sensory_dimension', generalForm.sensory_dimension);
      params.set('test_phase', generalForm.test_phase);
      params.set('experience_flow', generalForm.experience_flow);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      const res = await fetch(`/api/standard-items/search?${params}`);
      const data = await res.json();
      if (data.code === 0) setGeneralItems(data.data || []);
      else setGeneralItems([]);
    };
    fetchItems();
  }, [formCategory, generalForm.test_phase, generalForm.experience_flow, generalForm.sensory_dimension, taskProductCategory]);

  // ── 品类标准 form ──
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryAllItems, setCategoryAllItems] = useState<StandardItem[]>([]);

  // ── 品类标准: fetch ALL items when category is active ──
  useEffect(() => {
    if (formCategory !== '品类标准') return;
    setCategoryLoading(true);
    const fetchDimensions = async () => {
      const params = new URLSearchParams();
      params.set('category', '品类标准');
      if (categoryForm.sensory_dimension && categoryForm.sensory_dimension !== 'all') params.set('sensory_dimension', categoryForm.sensory_dimension);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      if (taskProduct) params.set('product', taskProduct);
      try {
        const res = await fetch(`/api/standard-items/search?${params}`);
        const data = await res.json();
        if (data.code === 0) {
          const items: StandardItem[] = data.data || [];
          setCategoryAllItems(items);
          const dims = [...new Set(items.map(i => i.check_dimension).filter(Boolean) as string[])];
          setCategoryDimensions(dims);
        } else {
          setCategoryAllItems([]);
          setCategoryDimensions([]);
        }
      } catch {
        setCategoryAllItems([]);
        setCategoryDimensions([]);
      }
      setCategoryLoading(false);
    };
    fetchDimensions();
  }, [formCategory, categoryForm.sensory_dimension, taskProductCategory, taskProduct]);

  // ── 品类标准: derive sub-dimensions and items when check_dimension changes ──
  useEffect(() => {
    if (formCategory !== '品类标准') return;
    if (!categoryForm.check_dimension) {
      setCategorySubDimensions([]);
      setCategoryItems([]);
      return;
    }
    const filtered = categoryAllItems.filter(i => i.check_dimension === categoryForm.check_dimension);
    const subDims = [...new Set(filtered.map(i => i.sub_check_dimension).filter(Boolean) as string[])];
    setCategorySubDimensions(subDims);
    const matched = filtered.filter(i => !categoryForm.sub_check_dimension || categoryForm.sub_check_dimension === 'all' || i.sub_check_dimension === categoryForm.sub_check_dimension);
    setCategoryItems(matched);
  }, [formCategory, categoryForm.check_dimension, categoryForm.sub_check_dimension, categoryAllItems]);

  // ── 感官评价标准: fetch reference items when sensory dimension selected ──
  useEffect(() => {
    if (formCategory !== '感官评价标准') return;
    if (!sensoryForm.sensory_dimension) {
      setSensoryRefItems([]);
      return;
    }
    const fetchItems = async () => {
      const params = new URLSearchParams();
      params.set('category', '感官评价标准');
      params.set('sensory_dimension', sensoryForm.sensory_dimension);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      const res = await fetch(`/api/standard-items/search?${params}`);
      const data = await res.json();
      if (data.code === 0) setSensoryRefItems(data.data || []);
      else setSensoryRefItems([]);
    };
    fetchItems();
  }, [formCategory, sensoryForm.sensory_dimension, taskProductCategory]);

  // ── Fuzzy search: keyword-based search across all standard items ──
  useEffect(() => {
    if (!fuzzyKeyword.trim()) { setFuzzyResults([]); return; }
    setFuzzyLoading(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      params.set('keyword', fuzzyKeyword.trim());
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      if (taskProduct) params.set('product', taskProduct);
      try {
        const res = await fetch(`/api/standard-items/search?${params}`);
        const data = await res.json();
        if (data.code === 0) setFuzzyResults(data.data || []);
        else setFuzzyResults([]);
      } catch { setFuzzyResults([]); }
      setFuzzyLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setFuzzyLoading(false); };
  }, [fuzzyKeyword, taskProductCategory, taskProduct]);

  // Fetch materials for each record
  useEffect(() => {
    const fetchRecordMaterials = async () => {
      const map: Record<string, Material[]> = {};
      for (const record of records) {
        try {
          const res = await fetch(`/api/materials?record_id=${record.id}`);
          const data = await res.json();
          if (data.code === 0) map[record.id] = data.data || [];
        } catch { /* ignore */ }
      }
      setRecordMaterials(map);
    };
    if (records.length > 0) fetchRecordMaterials();
  }, [records]);

  const resetForms = () => {
    setFormCategory('通用标准');
    setGeneralForm({ test_phase: '', experience_flow: '', sensory_dimension: '', selectedItemId: '', problem_description: '' });
    setGeneralItems([]);
    setCategoryForm({ sensory_dimension: '', check_dimension: '', sub_check_dimension: '', selectedItemId: '', problem_description: '' });
    setCategoryDimensions([]);
    setCategorySubDimensions([]);
    setCategoryItems([]);
    setCategoryLoading(false);
    setCategoryAllItems([]);
    setSensoryForm({ sensory_dimension: '', score: '', result_description: '' });
    setSensoryRefItems([]);
    setEvaluationResult('待定');
    setNonStandardForm({ description: '', problem_description: '' });
    setFuzzyKeyword('');
    setFuzzyResults([]);
    setSelectedMaterialIds([]);
    selectedMaterialIdsRef.current = [];
    sensesDraftDirtyRef.current = false;
    setSelectedMaterials([]);
    setInitialMaterialIds([]);
    editRecordIdRef.current = null;
    editRecordDataRef.current = null;
  };

  // ── Populate forms from existing record (for editing) ──
  const populateFormsFromRecord = (record: CheckRecord) => {
    const cat = record.standard_category || '通用标准';
    setFormCategory(cat);
    setEvaluationResult(record.evaluation_result || '待定');
    setFuzzyKeyword('');
    setFuzzyResults([]);

    if (cat === '通用标准') {
      setGeneralForm({
        test_phase: record.test_phase || '',
        experience_flow: record.experience_flow || '',
        sensory_dimension: record.sensory_dimension || '',
        selectedItemId: '',  // will be matched by useEffect when items load
        problem_description: record.problem_description || '',
      });
    } else if (cat === '品类标准') {
      setCategoryForm({
        sensory_dimension: record.sensory_dimension || '',
        check_dimension: record.check_dimension || '',
        sub_check_dimension: record.sub_check_dimension || '',
        selectedItemId: '',
        problem_description: record.problem_description || '',
      });
    } else if (cat === '感官评价标准') {
      setSensoryForm({
        sensory_dimension: record.sensory_dimension || '',
        score: (record as unknown as Record<string, unknown>).measurement_value as string || '',
        result_description: record.problem_description || '',
      });
    } else {
      setNonStandardForm({
        description: record.check_item || '',
        problem_description: record.problem_description || '',
      });
    }
  };

  // ── Handle edit: populate form and open dialog ──
  const handleEditRecord = (record: CheckRecord) => {
    setEditRecordId(record.id);
    setEditRecordData(record);
    editRecordIdRef.current = record.id;
    editRecordDataRef.current = record;
    populateFormsFromRecord(record);
    // Pre-select existing materials for this record
    const existingMats = recordMaterials[record.id] || [];
    const existingIds = existingMats.map(m => m.id);
    setSelectedMaterialIds(existingIds);
    selectedMaterialIdsRef.current = existingIds;
    setInitialMaterialIds(existingIds);
    setSelectedMaterials(existingMats);
    setAddDialogOpen(true);
  };

  // ── Auto-select matching standard item when in edit mode and items load ──
  useEffect(() => {
    if (!editRecordId) return;
    if (formCategory === '通用标准' && generalItems.length > 0 && !generalForm.selectedItemId) {
      // Try to find an item that matches the record's touch_point or check_requirement
      const record = records.find(r => r.id === editRecordId);
      if (record) {
        const match = generalItems.find(i =>
          (record.touch_point && i.touch_point === record.touch_point) ||
          (record.check_requirement && i.check_requirement === record.check_requirement)
        );
        if (match) setGeneralForm(prev => ({ ...prev, selectedItemId: match.id }));
      }
    }
  }, [editRecordId, formCategory, generalForm.selectedItemId, generalItems, records]);

  useEffect(() => {
    if (!editRecordId) return;
    if (formCategory === '品类标准' && categoryItems.length > 0 && !categoryForm.selectedItemId) {
      const record = records.find(r => r.id === editRecordId);
      if (record) {
        const match = categoryItems.find(i =>
          (record.check_item && i.check_item === record.check_item) ||
          (record.check_standard && i.check_standard === record.check_standard)
        );
        if (match) setCategoryForm(prev => ({ ...prev, selectedItemId: match.id }));
      }
    }
  }, [editRecordId, formCategory, categoryForm.selectedItemId, categoryItems, records]);

  const persistSensesDraft = async ({
    closeAfterSave = false,
    materialIds = selectedMaterialIdsRef.current,
  }: {
    closeAfterSave?: boolean;
    materialIds?: string[];
  } = {}): Promise<boolean> => {
    setSavingRecord(true);
    try {
      const activeRecordId = editRecordIdRef.current;
      // ── EDIT mode: update existing record ──
      if (activeRecordId) {
        const rec = editRecordDataRef.current;
        let body: Record<string, unknown> = { evaluation_result: evaluationResult };

        if (formCategory === '通用标准') {
          const selectedItem = generalItems.find(i => i.id === generalForm.selectedItemId);
          body = {
            ...body,
            standard_category: '通用标准',
            sensory_dimension: generalForm.sensory_dimension || null,
            test_phase: generalForm.test_phase || null,
            experience_flow: generalForm.experience_flow || null,
            touch_point: selectedItem?.touch_point || rec?.touch_point || null,
            check_item: selectedItem?.touch_point || selectedItem?.check_item || rec?.check_item || generalForm.experience_flow || '',
            check_requirement: selectedItem?.check_requirement || rec?.check_requirement || null,
            experience_standard: selectedItem?.experience_standard || rec?.experience_standard || null,
            check_tool: selectedItem?.check_tool || rec?.check_tool || null,
            problem_level: selectedItem?.problem_level || rec?.problem_level || null,
            problem_description: generalForm.problem_description || rec?.problem_description || null,
            check_dimension: null, sub_check_dimension: null, check_standard: null,
          };
        } else if (formCategory === '品类标准') {
          const selectedItem = categoryItems.find(i => i.id === categoryForm.selectedItemId);
          body = {
            ...body,
            standard_category: '品类标准',
            sensory_dimension: categoryForm.sensory_dimension || null,
            check_dimension: categoryForm.check_dimension || null,
            sub_check_dimension: selectedItem?.sub_check_dimension || categoryForm.sub_check_dimension || rec?.sub_check_dimension || null,
            check_item: selectedItem?.check_item || rec?.check_item || '',
            check_requirement: selectedItem?.check_requirement || rec?.check_requirement || null,
            check_standard: selectedItem?.check_standard || rec?.check_standard || null,
            problem_description: categoryForm.problem_description || rec?.problem_description || null,
            test_phase: null, experience_flow: null, touch_point: null, experience_standard: null,
          };
        } else if (formCategory === '感官评价标准') {
          const refItem = sensoryRefItems[0];
          body = {
            ...body,
            standard_category: '感官评价标准',
            sensory_dimension: sensoryForm.sensory_dimension || null,
            check_item: `${sensoryForm.sensory_dimension}评价`,
            check_requirement: refItem?.evaluation_prep || rec?.check_requirement || null,
            experience_standard: refItem?.experience_standard || rec?.experience_standard || null,
            check_standard: refItem?.subjective_rating || rec?.check_standard || null,
            problem_description: sensoryForm.result_description || rec?.problem_description || null,
            measurement_value: sensoryForm.score || null,
            test_phase: null, experience_flow: null, touch_point: null,
            check_dimension: null, sub_check_dimension: null,
          };
        } else {
          body = {
            ...body,
            standard_category: '非标准',
            check_item: nonStandardForm.description || rec?.check_item || '',
            problem_description: nonStandardForm.problem_description || rec?.problem_description || null,
            test_phase: null, experience_flow: null, sensory_dimension: null, touch_point: null,
            check_requirement: rec?.check_requirement || null, experience_standard: null, check_dimension: null,
            sub_check_dimension: null, check_standard: null,
          };
        }

        const res = await fetch(`/api/records/${activeRecordId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.code === 0) {
          // Link newly selected materials
          for (const matId of materialIds) {
            const materialResponse = await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, record_id: activeRecordId }),
            });
            const materialData = await materialResponse.json().catch(() => ({}));
            if (!materialResponse.ok || materialData.code !== 0) throw new Error(materialData.message || '素材关联自动保存失败');
          }
          // Unlink materials that were deselected (existed initially but not in current selection)
          const removedIds = initialMaterialIds.filter(id => !materialIds.includes(id));
          for (const matId of removedIds) {
            const materialResponse = await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, record_id: null, unlink_target_id: activeRecordId }),
            });
            const materialData = await materialResponse.json().catch(() => ({}));
            if (!materialResponse.ok || materialData.code !== 0) throw new Error(materialData.message || '素材解除关联自动保存失败');
          }
          setInitialMaterialIds(materialIds);
          selectedMaterialIdsRef.current = materialIds;
          sensesDraftDirtyRef.current = false;
          onRefresh();
          if (closeAfterSave) {
            setAddDialogOpen(false);
            resetForms();
            setEditRecordId(null);
            setEditRecordData(null);
          }
          return true;
        }
        throw new Error(data.message || '五感体验自动保存失败');
      }

      // ── ADD mode: create new record ──
      let body: Record<string, unknown> = { task_id: taskId, evaluation_result: evaluationResult, sort_order: records.length };

      if (formCategory === '通用标准') {
        const selectedItem = generalItems.find(i => i.id === generalForm.selectedItemId);
        body = {
          ...body,
          standard_category: '通用标准',
          sensory_dimension: generalForm.sensory_dimension || null,
          test_phase: generalForm.test_phase || null,
          experience_flow: generalForm.experience_flow || null,
          touch_point: selectedItem?.touch_point || null,
          check_item: selectedItem?.touch_point || selectedItem?.check_item || generalForm.experience_flow || '',
          check_requirement: selectedItem?.check_requirement || null,
          experience_standard: selectedItem?.experience_standard || null,
          problem_description: generalForm.problem_description || null,
        };
      } else if (formCategory === '品类标准') {
        const selectedItem = categoryItems.find(i => i.id === categoryForm.selectedItemId);
        body = {
          ...body,
          standard_category: '品类标准',
          sensory_dimension: categoryForm.sensory_dimension || null,
          check_dimension: categoryForm.check_dimension || null,
          sub_check_dimension: selectedItem?.sub_check_dimension || categoryForm.sub_check_dimension || null,
          check_item: selectedItem?.check_item || '',
          check_requirement: selectedItem?.check_requirement || null,
          check_standard: selectedItem?.check_standard || null,
          problem_description: categoryForm.problem_description || null,
        };
      } else if (formCategory === '感官评价标准') {
        const refItem = sensoryRefItems[0];
        body = {
          ...body,
          standard_category: '感官评价标准',
          sensory_dimension: sensoryForm.sensory_dimension || null,
          check_item: `${sensoryForm.sensory_dimension}评价`,
          check_requirement: refItem?.evaluation_prep || null,
          check_standard: refItem?.subjective_rating || null,
          problem_description: sensoryForm.result_description || null,
          measurement_value: sensoryForm.score || null,
        };
      } else if (formCategory === '非标准') {
        body = {
          ...body,
          standard_category: '非标准',
          check_item: nonStandardForm.description || '',
          problem_description: nonStandardForm.problem_description || null,
        };
      }

      const res = await fetch('/api/records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code === 0) {
        const recordId = data.data?.id;
        if (recordId && materialIds.length > 0) {
          for (const matId of materialIds) {
            const materialResponse = await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, record_id: recordId }),
            });
            const materialData = await materialResponse.json().catch(() => ({}));
            if (!materialResponse.ok || materialData.code !== 0) throw new Error(materialData.message || '素材关联自动保存失败');
          }
        }
        if (recordId) {
          setEditRecordId(recordId);
          setEditRecordData(data.data || null);
          editRecordIdRef.current = recordId;
          editRecordDataRef.current = data.data || null;
        }
        setInitialMaterialIds(materialIds);
        selectedMaterialIdsRef.current = materialIds;
        sensesDraftDirtyRef.current = false;
        onRefresh();
        onStatusUpdate();
        if (closeAfterSave) {
          setAddDialogOpen(false);
          resetForms();
          setEditRecordId(null);
          setEditRecordData(null);
        }
        return true;
      }
      throw new Error(data.message || '五感体验自动保存失败');
    } catch (error) {
      toast.error(error instanceof Error ? `自动保存失败：${error.message}` : '五感体验自动保存失败');
      return false;
    } finally {
      setSavingRecord(false);
    }
  };

  const handleAdd = async (options: { closeAfterSave?: boolean; materialIds?: string[] } = {}): Promise<boolean> => {
    if (sensesSaveInFlightRef.current) await sensesSaveInFlightRef.current;
    const request = persistSensesDraft(options);
    sensesSaveInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (sensesSaveInFlightRef.current === request) sensesSaveInFlightRef.current = null;
    }
  };

  // Check if form is valid for submission
  const isFormValid = () => {
    if (editRecordId) {
      // In edit mode, just need basic fields (no need to re-select a standard item)
      if (formCategory === '通用标准') return !!(generalForm.test_phase && generalForm.experience_flow && generalForm.sensory_dimension);
      if (formCategory === '品类标准') return !!categoryForm.check_dimension;
      if (formCategory === '感官评价标准') return !!sensoryForm.sensory_dimension;
      if (formCategory === '非标准') return !!nonStandardForm.description;
      return false;
    }
    if (formCategory === '通用标准') return !!(generalForm.test_phase && generalForm.experience_flow && generalForm.sensory_dimension && generalForm.selectedItemId);
    if (formCategory === '品类标准') return !!(categoryForm.check_dimension && categoryForm.selectedItemId);
    if (formCategory === '感官评价标准') return !!(sensoryForm.sensory_dimension && sensoryForm.score);
    if (formCategory === '非标准') return !!nonStandardForm.description;
    return false;
  };

  const handleSensesFieldCompletion = () => {
    if (sensesDraftDirtyRef.current && isFormValid()) void handleAdd();
  };

  const handleSensesFieldKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    target.blur();
  };

  const handleSensesMaterialSelectionChange = (ids: string[], materials: Material[]) => {
    const selectionChanged = hasMaterialSelectionChanged(selectedMaterialIdsRef.current, ids);
    setSelectedMaterialIds(ids);
    selectedMaterialIdsRef.current = ids;
    setSelectedMaterials(materials);
    if (!selectionChanged) return;
    sensesDraftDirtyRef.current = true;
    if (isFormValid()) void handleAdd({ materialIds: ids });
  };

  const closeSensesDialogWithoutSaving = () => {
    setAddDialogOpen(false);
    resetForms();
    setEditRecordId(null);
    setEditRecordData(null);
  };

  const handleSensesDialogOpenChange = (open: boolean) => {
    if (open) {
      setAddDialogOpen(true);
      return;
    }
    if (shouldCloseSensesDraftWithoutSaving({ draftDirty: sensesDraftDirtyRef.current, formValid: isFormValid() })) {
      closeSensesDialogWithoutSaving();
      return;
    }
    if (!isFormValid()) {
      toast.error('自动保存失败：请先完成当前五感体验的必填字段');
      return;
    }
    void (async () => {
      const saved = await handleAdd({ closeAfterSave: true });
      if (!saved) return;
    })();
  };

  // Group records by standard_category then sensory_dimension
  const grouped = records.reduce<Record<string, CheckRecord[]>>((acc, r) => {
    const cat = r.standard_category || '未分类';
    const key = `${cat} · ${r.sensory_dimension || '未分类'}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Get selected item for general standard
  const selectedGeneralItem = generalItems.find(i => i.id === generalForm.selectedItemId);
  // Get selected item for category standard
  const selectedCategoryItem = categoryItems.find(i => i.id === categoryForm.selectedItemId);

  // Handle fuzzy search selection: auto-fill form based on matched standard item
  const handleFuzzySelect = (item: StandardItem) => {
    const stdCat = item.standard?.category as string || '通用标准';
    setFormCategory(stdCat);
    setFuzzyKeyword('');
    setFuzzyResults([]);

    if (stdCat === '通用标准') {
      // Auto-fill test_phase, experience_flow, sensory_dimension
      const itemAny = item as unknown as Record<string, unknown>;
      const phase = itemAny.test_phase as string || '';
      const flow = itemAny.experience_flow as string || '';
      const dim = itemAny.sensory_dimension as string || '';
      setGeneralForm(prev => ({ ...prev, test_phase: phase, experience_flow: flow, sensory_dimension: dim, selectedItemId: item.id }));
      // Items will be fetched via useEffect once the form state updates
    } else if (stdCat === '品类标准') {
      const itemAny = item as unknown as Record<string, unknown>;
      const dim = itemAny.sensory_dimension as string || '';
      const checkDim = itemAny.check_dimension as string || '';
      setCategoryForm(prev => ({ ...prev, sensory_dimension: dim, check_dimension: checkDim, selectedItemId: item.id }));
    } else if (stdCat === '感官评价标准') {
      const itemAny = item as unknown as Record<string, unknown>;
      const dim = itemAny.sensory_dimension as string || '';
      setSensoryForm(prev => ({ ...prev, sensory_dimension: dim }));
    }
  };

  // Fuzzy search input component (shown for 通用标准/品类标准/感官评价标准)
  const renderFuzzySearch = () => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">描述结果快速匹配</Label>
      <Input placeholder="输入关键词搜索标准库..." value={fuzzyKeyword}
        onChange={(e) => setFuzzyKeyword(e.target.value)} />
      {fuzzyLoading && <p className="text-xs text-muted-foreground animate-pulse">搜索中...</p>}
      {fuzzyResults.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
          {fuzzyResults.slice(0, 20).map((item) => {
            const stdCat = item.standard?.category || '通用标准';
            return (
              <div key={item.id}
                className="p-2 rounded-md cursor-pointer text-xs transition-colors border border-transparent hover:bg-muted/50"
                onClick={() => handleFuzzySelect(item)}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{stdCat}</Badge>
                  <span className="font-medium truncate">{item.touch_point || item.check_item}</span>
                </div>
                {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-1">{item.check_requirement}</p>}
                <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                  {(() => { const it = item as unknown as Record<string, unknown>; return (<>
                    {it.test_phase && <span>阶段: {it.test_phase as string}</span>}
                    {it.experience_flow && <span>流程: {it.experience_flow as string}</span>}
                    {it.sensory_dimension && <span>维度: {it.sensory_dimension as string}</span>}
                  </>); })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {fuzzyKeyword.trim() && !fuzzyLoading && fuzzyResults.length === 0 && (
        <p className="text-xs text-muted-foreground">未找到匹配的标准项</p>
      )}
    </div>
  );

  // Render the add form based on category
  const renderAddForm = () => {
    // Standard type selector
    const categorySelector = (
      <div className="space-y-1.5">
        <Label>标准类型</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {standardCategoryOptions.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cn(
                'px-2 py-2 rounded-md text-xs font-medium border-2 transition-colors text-center',
                formCategory === cat ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
              )}
              onClick={() => {
                setFormCategory(cat);
                setGeneralItems([]);
                setCategoryDimensions([]);
                setCategorySubDimensions([]);
                setCategoryItems([]);
                setSensoryRefItems([]);
                // In edit mode, populate the new category form with shared data from the record
                if (editRecordData) {
                  if (cat === '通用标准') {
                    setGeneralForm({
                      test_phase: editRecordData.test_phase || '',
                      experience_flow: editRecordData.experience_flow || '',
                      sensory_dimension: editRecordData.sensory_dimension || '',
                      selectedItemId: '',
                      problem_description: editRecordData.problem_description || '',
                    });
                  } else if (cat === '品类标准') {
                    setCategoryForm({
                      sensory_dimension: editRecordData.sensory_dimension || '',
                      check_dimension: editRecordData.check_dimension || '',
                      sub_check_dimension: editRecordData.sub_check_dimension || '',
                      selectedItemId: '',
                      problem_description: editRecordData.problem_description || '',
                    });
                  } else if (cat === '感官评价标准') {
                    setSensoryForm({
                      sensory_dimension: editRecordData.sensory_dimension || '',
                      score: (editRecordData as unknown as Record<string, unknown>).measurement_value as string || '',
                      result_description: editRecordData.problem_description || '',
                    });
                  } else {
                    setNonStandardForm({
                      description: editRecordData.check_item || '',
                      problem_description: editRecordData.problem_description || '',
                    });
                  }
                }
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    );

    // ── 通用标准 form ──
    if (formCategory === '通用标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>产品使用阶段 *</Label>
            <Select value={generalForm.test_phase} onValueChange={(v) => setGeneralForm({ ...generalForm, test_phase: v, experience_flow: '', selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{phaseOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>体验流程 *</Label>
            <Select value={generalForm.experience_flow} onValueChange={(v) => setGeneralForm({ ...generalForm, experience_flow: v, selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{(flowByPhase[generalForm.test_phase] || []).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>感官维度 *</Label>
          <Select value={generalForm.sensory_dimension} onValueChange={(v) => setGeneralForm({ ...generalForm, sensory_dimension: v, selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Matched standard items - user selects one */}
        {generalItems.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">从标准库选择检查项 * ({generalItems.length}项匹配)</Label>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
              {generalItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'p-2.5 rounded-md cursor-pointer text-xs transition-colors border',
                    generalForm.selectedItemId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  )}
                  onClick={() => setGeneralForm({ ...generalForm, selectedItemId: item.id })}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.touch_point || item.check_item}</span>
                    {item.problem_level && <Badge variant="secondary" className="text-[9px] h-4">{item.problem_level}</Badge>}
                  </div>
                  {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.check_requirement}</p>}
                  {item.experience_standard && <p className="text-primary/70 mt-0.5">标准: {item.experience_standard}</p>}
                  {item.check_tool && <p className="text-muted-foreground mt-0.5 text-xs">工具: {item.check_tool}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {generalForm.test_phase && generalForm.experience_flow && generalForm.sensory_dimension && generalItems.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">未找到匹配的标准检查项，请确认筛选条件</p>
          </div>
        )}

        {/* Auto-filled fields preview from selected item, or existing values in edit mode */}
        {(selectedGeneralItem || (editRecordData && formCategory === '通用标准')) && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">{selectedGeneralItem ? '自动引用（来自标准库）' : '当前引用（编辑中）'}</Label>
            {(selectedGeneralItem?.touch_point || editRecordData?.touch_point) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">触点</span><span className="font-medium">{selectedGeneralItem?.touch_point || editRecordData?.touch_point}</span></div>
            )}
            {(selectedGeneralItem?.check_requirement || editRecordData?.check_requirement) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检验范围及具体要求</span><span>{selectedGeneralItem?.check_requirement || editRecordData?.check_requirement}</span></div>
            )}
            {(selectedGeneralItem?.experience_standard || editRecordData?.experience_standard) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">体验标准</span><span>{selectedGeneralItem?.experience_standard || editRecordData?.experience_standard}</span></div>
            )}
            {(selectedGeneralItem?.check_tool || editRecordData?.check_tool) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">测量工具</span><span>{selectedGeneralItem?.check_tool || editRecordData?.check_tool}</span></div>
            )}
            {(selectedGeneralItem?.problem_level) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">问题等级</span><Badge variant="secondary" className="text-[9px] h-4">{selectedGeneralItem.problem_level}</Badge></div>
            )}
            {!selectedGeneralItem && editRecordData && (
              <p className="text-xs text-muted-foreground mt-1">选择标准库检查项可更新引用，或直接保存保持原值</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果" value={generalForm.problem_description} onChange={(e) => setGeneralForm({ ...generalForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} recordId={editRecordId || undefined} selectedIds={selectedMaterialIds} initialMaterials={editRecordId ? (recordMaterials[editRecordId] || []) : undefined} onSelectionChange={handleSensesMaterialSelectionChange} enableImageEditing />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {savingRecord && <p role="status" className="text-center text-xs text-muted-foreground">自动保存中...</p>}
      </div>
    );

    // ── 品类标准 form ──
    if (formCategory === '品类标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        {/* Show no-data warning if product has no 品类标准 */}
        {categoryDimensions.length === 0 && !categoryLoading && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">当前产品品类「{taskProductCategory || '未指定'}」暂无品类标准数据，请先在标准管理中导入对应品类的标准</p>
          </div>
        )}
        {categoryLoading && (
          <div className="text-xs text-muted-foreground animate-pulse">正在加载品类标准...</div>
        )}
        <div className="space-y-1.5">
          <Label>感官维度</Label>
          <Select value={categoryForm.sensory_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, sensory_dimension: v, check_dimension: '', sub_check_dimension: '', selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder="选择（可选）" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>检查维度 * {categoryDimensions.length > 0 && `(${categoryDimensions.length}个)`}</Label>
          <Select value={categoryForm.check_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, check_dimension: v, sub_check_dimension: '', selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder={categoryDimensions.length > 0 ? "从标准库选择" : "暂无数据"} /></SelectTrigger>
            <SelectContent>
              {categoryDimensions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {categorySubDimensions.length > 0 && (
          <div className="space-y-1.5">
            <Label>细分检查维度</Label>
            <Select value={categoryForm.sub_check_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, sub_check_dimension: v, selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择（可选）" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {categorySubDimensions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Matched items - user selects one */}
        {categoryItems.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">从标准库选择检查项 * ({categoryItems.length}项匹配)</Label>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'p-2.5 rounded-md cursor-pointer text-xs transition-colors border',
                    categoryForm.selectedItemId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  )}
                  onClick={() => setCategoryForm({ ...categoryForm, selectedItemId: item.id })}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.check_item}</span>
                    {item.sub_check_dimension && <Badge variant="secondary" className="text-[9px] h-4">{item.sub_check_dimension}</Badge>}
                  </div>
                  {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.check_requirement}</p>}
                  {item.check_standard && <p className="text-primary/70 mt-0.5">标准: {item.check_standard}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-filled fields preview from selected item, or existing values in edit mode */}
        {(selectedCategoryItem || (editRecordData && formCategory === '品类标准')) && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">{selectedCategoryItem ? '自动引用（来自标准库）' : '当前引用（编辑中）'}</Label>
            {(selectedCategoryItem?.check_item || editRecordData?.check_item) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">具体检查条目</span><span className="font-medium">{selectedCategoryItem?.check_item || editRecordData?.check_item}</span></div>
            )}
            {(selectedCategoryItem?.check_requirement || editRecordData?.check_requirement) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检查要求及区域</span><span>{selectedCategoryItem?.check_requirement || editRecordData?.check_requirement}</span></div>
            )}
            {(selectedCategoryItem?.check_standard || editRecordData?.check_standard) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检查标准</span><span>{selectedCategoryItem?.check_standard || editRecordData?.check_standard}</span></div>
            )}
            {!selectedCategoryItem && editRecordData && (
              <p className="text-xs text-muted-foreground mt-1">选择标准库检查项可更新引用，或直接保存保持原值</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果" value={categoryForm.problem_description} onChange={(e) => setCategoryForm({ ...categoryForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} recordId={editRecordId || undefined} selectedIds={selectedMaterialIds} initialMaterials={editRecordId ? (recordMaterials[editRecordId] || []) : undefined} onSelectionChange={handleSensesMaterialSelectionChange} enableImageEditing />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {savingRecord && <p role="status" className="text-center text-xs text-muted-foreground">自动保存中...</p>}
      </div>
    );

    // ── 感官评价标准 form ──
    if (formCategory === '感官评价标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        <div className="space-y-1.5">
          <Label>感官维度 *</Label>
          <Select value={sensoryForm.sensory_dimension} onValueChange={(v) => setSensoryForm({ ...sensoryForm, sensory_dimension: v, score: '', result_description: '' })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Auto-filled reference from standard, or existing values in edit mode */}
        {(sensoryRefItems.length > 0 || (editRecordData && formCategory === '感官评价标准')) && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">{sensoryRefItems.length > 0 ? '引用标准（来自标准库）' : '当前引用（编辑中）'}</Label>
            {(sensoryRefItems[0]?.evaluation_prep || editRecordData?.check_requirement) && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">感官评价准备</span><span>{sensoryRefItems[0]?.evaluation_prep || editRecordData?.check_requirement}</span></div>
            )}
            {sensoryRefItems.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">主观满意度标准</span>
                {sensoryRefItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <span className="w-8 shrink-0 font-medium">{item.subjective_score}分</span>
                    <span>{item.subjective_rating}</span>
                  </div>
                ))}
              </div>
            )}
            {!sensoryRefItems.length && editRecordData && (
              <>
                {editRecordData.experience_standard && (
                  <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">体验标准</span><span>{editRecordData.experience_standard}</span></div>
                )}
                <p className="text-xs text-muted-foreground mt-1">选择感官维度可更新引用，或直接保存保持原值</p>
              </>
            )}
          </div>
        )}
        {sensoryForm.sensory_dimension && sensoryRefItems.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">未找到匹配的感官评价标准</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>评分 *</Label>
          <Input type="number" min={1} max={5} placeholder="输入1-5分" value={sensoryForm.score} onChange={(e) => setSensoryForm({ ...sensoryForm, score: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>结果描述</Label>
          <Textarea placeholder="描述评价结果" value={sensoryForm.result_description} onChange={(e) => setSensoryForm({ ...sensoryForm, result_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} recordId={editRecordId || undefined} selectedIds={selectedMaterialIds} initialMaterials={editRecordId ? (recordMaterials[editRecordId] || []) : undefined} onSelectionChange={handleSensesMaterialSelectionChange} enableImageEditing />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {savingRecord && <p role="status" className="text-center text-xs text-muted-foreground">自动保存中...</p>}
      </div>
    );

    // ── 非标准 form ──
    if (formCategory === '非标准') return (
      <div className="space-y-3">
        {categorySelector}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">非标准检查项无需关联产品使用阶段、体验流程、感官维度，仅需描述检查内容和结果</p>
        </div>
        {editRecordData?.check_requirement && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">当前检查要求</Label>
            <p className="break-words text-xs leading-relaxed">{editRecordData.check_requirement}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>描述结果 *</Label>
          <Textarea placeholder="描述检查项内容" value={nonStandardForm.description}
            onChange={(e) => setNonStandardForm({ ...nonStandardForm, description: e.target.value })} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果（可选）" value={nonStandardForm.problem_description}
            onChange={(e) => setNonStandardForm({ ...nonStandardForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} recordId={editRecordId || undefined} selectedIds={selectedMaterialIds} initialMaterials={editRecordId ? (recordMaterials[editRecordId] || []) : undefined} onSelectionChange={handleSensesMaterialSelectionChange} enableImageEditing />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {savingRecord && <p role="status" className="text-center text-xs text-muted-foreground">自动保存中...</p>}
      </div>
    );

    return <div className="space-y-3">{categorySelector}<p className="text-sm text-muted-foreground text-center py-4">请选择标准类型</p></div>;
  };

  const openCreateRecordDialog = async () => {
    setEditRecordId(null);
    setEditRecordData(null);
    resetForms();
    try {
      const res = await fetch('/api/settings?key=senses_defaults');
      const d = await res.json();
      if (d.code === 0 && d.data) {
        const defaults = d.data;
        if (defaults.test_phase) {
          setGeneralForm(prev => ({ ...prev, test_phase: defaults.test_phase, experience_flow: defaults.experience_flow || '' }));
        }
        if (defaults.sensory_dimension) {
          setGeneralForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
          setCategoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
          setSensoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
        }
      }
    } catch {}
    setAddDialogOpen(true);
  };

  const handleDeleteRecord = async (record: CheckRecord) => {
    try {
      const res = await fetch(`/api/records/${record.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.code !== 0) {
        throw new Error(data.message || '删除失败，当前检查记录已保留');
      }
      if (editRecordId === record.id) setEditRecordId(null);
      toast.success('检查记录已删除');
    } catch (error) {
      throw error instanceof Error ? error : new Error('删除失败，当前检查记录已保留');
    }
  };


  return (
    <div className="space-y-4">
      <PreviewComponent />

      <SensesInputWorkspace
        records={displayRecords}
        focusedRecordId={focusedRecordId}
        recordMaterials={recordMaterials}
        onCreateRecord={openCreateRecordDialog}
        onEditRecord={handleEditRecord}
        onDeleteRecord={handleDeleteRecord}
        onPreview={open}
        onBindingTargetChange={(target) => onBindingTargetChange?.(target)}
        attemptNavigation={attemptNavigation}
        onMaterialsChange={onRefresh}
        onRecordPatched={(recordId, patch) => {
          setRecordPatches((current) => ({
            ...current,
            [recordId]: { ...(current[recordId] || {}), ...patch },
          }));
        }}
      />

      <div className="hidden">
      {records.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Eye className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无问题点</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方按钮新增</p>
        </CardContent></Card>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {(() => {
                  const [cat, dim] = group.split(' · ');
                  return (
                    <>
                      <Badge variant="secondary" className="text-xs">{cat}</Badge>
                      <Badge className={cn('text-xs', sensoryColors[dim] || 'bg-muted')}>{dim}</Badge>
                      <span className="text-muted-foreground text-xs">{items.length} 项</span>
                    </>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {items.map((record) => {
                const mats = recordMaterials[record.id] || [];
                return (
                  <div
                    key={record.id}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleEditRecord(record)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        record.evaluation_result === '合格' ? 'bg-emerald-500' :
                        record.evaluation_result === '不合格' ? 'bg-red-500' : 'bg-amber-500'
                      )} />
                      <span className="text-sm flex-1 truncate">{record.check_item}</span>
                      {record.check_dimension && (
                        <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.check_dimension}</span>
                      )}
                      {record.sub_check_dimension && (
                        <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.sub_check_dimension}</span>
                      )}
                      {record.test_phase && (
                        <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.test_phase}</span>
                      )}
                      {record.experience_flow && (
                        <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.experience_flow}</span>
                      )}
                      {record.touch_point && (
                        <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.touch_point}</span>
                      )}
                      <span className={cn('text-xs font-medium shrink-0',
                        record.evaluation_result === '合格' ? 'text-emerald-600' :
                        record.evaluation_result === '不合格' ? 'text-destructive' : 'text-amber-600'
                      )}>{record.evaluation_result}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record); }}>
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                    {/* Thumbnails per problem point */}
                    <MediaGallery materials={mats} responsive columns={{ mobile: 3, sm: 4 }} className="ml-5 mt-2" onPreview={open} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add button */}
      <div className="sticky bottom-4">
        <Button className="w-full" onClick={async () => {
          setEditRecordId(null);
          setEditRecordData(null);
          resetForms();
          // Apply saved senses defaults from DB (admin global setting)
          try {
            const res = await fetch('/api/settings?key=senses_defaults');
            const d = await res.json();
            if (d.code === 0 && d.data) {
              const defaults = d.data;
              if (defaults.test_phase) {
                setGeneralForm(prev => ({ ...prev, test_phase: defaults.test_phase, experience_flow: defaults.experience_flow || '' }));
              }
              if (defaults.sensory_dimension) {
                setGeneralForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
                setCategoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
                setSensoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
              }
            }
          } catch {}
          setAddDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1.5" /> 新增问题点
        </Button>
      </div>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={addDialogOpen} onOpenChange={handleSensesDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editRecordId ? '编辑问题点' : '新增问题点'}</DialogTitle></DialogHeader>
          <div
            className="mt-2"
            onChangeCapture={() => { sensesDraftDirtyRef.current = true; }}
            onBlurCapture={handleSensesFieldCompletion}
            onKeyDownCapture={handleSensesFieldKeyDown}
          >
            {renderAddForm()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



/* ─── Tab: 功能效果 ─── */
function FunctionsTab({
  taskId,
  initialRecipes,
  focusedRecipeId,
  focusedRecipeStepId,
  onStatusUpdate,
  onRecipesChange,
  onBindingTargetChange,
  attemptNavigation,
}: {
  taskId: string;
  initialRecipes?: Recipe[];
  focusedRecipeId?: string;
  focusedRecipeStepId?: string;
  onStatusUpdate: () => void;
  onRecipesChange?: (recipes: Recipe[]) => void;
  onBindingTargetChange?: (target: EvidenceBindingTarget | null) => void;
  attemptNavigation: (next: () => void) => Promise<void>;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes || []);
  const [loading, setLoading] = useState((initialRecipes || []).length === 0);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingEditStep, setSavingEditStep] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [editStepDialogOpen, setEditStepDialogOpen] = useState(false);
  const [editRecipeDialogOpen, setEditRecipeDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingStep, setEditingStep] = useState<RecipeStep | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: '',
    recipe_type: '食谱',
    ingredient_items: [{ name: '', quantity: '', unit: '', note: '' }] as IngredientDraftItem[],
  });
  const [editRecipeForm, setEditRecipeForm] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [newStep, setNewStep] = useState({ operation: '', step_material_ids: [] as string[] });
  const [stepMaterialIds, setStepMaterialIds] = useState<string[]>([]);
  const [, setStepMaterials] = useState<Material[]>([]);
  const [editStepForm, setEditStepForm] = useState({ operation: '', step_material_ids: [] as string[] });
  const [, setEditStepMaterialIds] = useState<string[]>([]);
  const [, setEditStepMaterials] = useState<Material[]>([]);
  const { PreviewComponent } = useImagePreview();

  // ── Recipe library search (Feature 7) ──
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState<RecipeLibRef[]>([]);
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);

  // ── Step reference search (Feature 7) ──
  const [stepRefSearch, setStepRefSearch] = useState('');
  const [stepRefResults, setStepRefResults] = useState<RecipeLibRef[]>([]);
  const [stepRefLoading, setStepRefLoading] = useState(false);

  useEffect(() => {
    if (initialRecipes && initialRecipes.length > 0) {
      setRecipes(initialRecipes);
      setLoading(false);
    }
  }, [initialRecipes]);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const enriched = await loadRecipesForTask(taskId);
      setRecipes(enriched);
      onRecipesChange?.(enriched);
    } catch {
      toast.error('功能/食谱列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [taskId, onRecipesChange]);

  const recipeDeletion = useDeletionFlowController({
    load: (target) => loadDeletionImpact(target.kind, target.id),
    remove: async (target) => {
      const response = await fetch(`/api/recipes/${target.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code !== 0) throw new Error(data.message || '删除失败，当前内容已保留');
      if (selectedRecipe?.id === target.id) setSelectedRecipe(null);
      toast.success('食谱/功能已删除');
    },
    refresh: fetchRecipes,
    onError: (error) => toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试'),
  });

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  // ── Recipe library fuzzy search ──
  useEffect(() => {
    if (!recipeSearch.trim()) { setRecipeSearchResults([]); return; }
    setRecipeSearchLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipe-library?keyword=${encodeURIComponent(recipeSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setRecipeSearchResults(data.data || []);
      else setRecipeSearchResults([]);
      setRecipeSearchLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setRecipeSearchLoading(false); };
  }, [recipeSearch]);

  // ── Step reference fuzzy search ──
  useEffect(() => {
    if (!stepRefSearch.trim()) { setStepRefResults([]); return; }
    setStepRefLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipe-library?keyword=${encodeURIComponent(stepRefSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setStepRefResults(data.data || []);
      else setStepRefResults([]);
      setStepRefLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setStepRefLoading(false); };
  }, [stepRefSearch]);

  const handleAddRecipe = async () => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          name: newRecipe.name,
          ingredients: newRecipe.ingredients,
          recipe_type: newRecipe.recipe_type,
          ingredient_items: [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setAddDialogOpen(false);
        setNewRecipe({
          name: '',
          ingredients: '',
          recipe_type: '食谱',
          ingredient_items: [{ name: '', quantity: '', unit: '', note: '' }],
        });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('食谱/功能已添加');
      }
    } finally {
      setSavingRecipe(false);
    }
  };

  // ── Edit recipe (Feature 3) ──
  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setEditRecipeForm({
      name: recipe.name,
      ingredients: recipe.ingredients || '',
      recipe_type: recipe.recipe_type || '食谱',
    });
    setEditRecipeDialogOpen(true);
  };

  const handleSaveEditRecipe = async () => {
    if (!editingRecipe || savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch(`/api/recipes/${editingRecipe.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editRecipeForm.name,
          recipe_type: editRecipeForm.recipe_type,
          ingredients: editRecipeForm.ingredients,
          ingredient_items: [],
          problem_count: editingRecipe.problem_count,
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setEditRecipeDialogOpen(false);
        setEditingRecipe(null);
        fetchRecipes();
        toast.success('食谱/功能已更新');
      } else toast.error(data.message);
    } finally { setSavingRecipe(false); }
  };

  // ── Reference recipe from library (Feature 7) ──
  const handleReferenceRecipe = async (refRecipe: RecipeLibRef) => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, name: refRecipe.name, ingredients: refRecipe.ingredients, recipe_type: refRecipe.recipe_type }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const newRecipeId = data.data?.id;
        // Copy steps from referenced library recipe
        if (refRecipe.recipe_library_steps && refRecipe.recipe_library_steps.length > 0 && newRecipeId) {
          for (let i = 0; i < refRecipe.recipe_library_steps.length; i++) {
            const srcStep = refRecipe.recipe_library_steps[i];
            await fetch('/api/recipe-steps', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipe_id: newRecipeId,
                step_number: i + 1,
                operation: srcStep.operation,
              }),
            });
          }
        }
        setAddDialogOpen(false);
        setNewRecipe({
          name: '',
          ingredients: '',
          recipe_type: '食谱',
          ingredient_items: [{ name: '', quantity: '', unit: '', note: '' }],
        });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('已引用食谱/功能');
      }
    } finally { setSavingRecipe(false); }
  };

  // ── Reference step from another recipe (Feature 7) ──
  const handleReferenceStep = (srcStep: RecipeStep) => {
    setNewStep(prev => ({
      ...prev,
      operation: prev.operation ? prev.operation + '\n' + srcStep.operation : srcStep.operation,
    }));
    setStepRefSearch('');
    setStepRefResults([]);
  };

  const handleAddStep = async () => {
    if (!selectedRecipe || savingStep) return;
    setSavingStep(true);
    try {
      const countRes = await fetch(`/api/recipe-steps?recipe_id=${selectedRecipe.id}`);
      const countData = await countRes.json();
      const currentSteps = countData.data || [];
      const stepNum = currentSteps.length + 1;
      const res = await fetch('/api/recipe-steps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: selectedRecipe.id,
          step_number: stepNum,
          operation: newStep.operation,
          step_material_ids: newStep.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const stepId = data.data?.id;
        if (stepId && stepMaterialIds.length > 0) {
          for (const matId of stepMaterialIds) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
        }
        if (stepId) {
          for (const matId of (newStep.step_material_ids || [])) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
        }
        setAddStepDialogOpen(false);
        setNewStep({ operation: '', step_material_ids: [] });
        setStepMaterialIds([]);
        setStepMaterials([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('步骤已添加');
      }
    } finally {
      setSavingStep(false);
    }
  };

  const handleEditStep = (step: RecipeStep) => {
    setEditingStep(step);
    const stepMats = step.materials || [];
    const stepMatIds = stepMats.map(m => m.id);
    setEditStepForm({ operation: step.operation, step_material_ids: stepMatIds });
    setEditStepMaterialIds([]);
    setEditStepMaterials([]);
    setEditStepDialogOpen(true);
  };

  const handleSaveEditStep = async () => {
    if (!editingStep || savingEditStep) return;
    setSavingEditStep(true);
    try {
      const res = await fetch(`/api/recipe-steps/${editingStep.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: editStepForm.operation,
          step_material_ids: editStepForm.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        // Compute all currently selected material IDs
        const allSelectedIds = new Set([
          ...(editStepForm.step_material_ids || []),
        ]);
        const initialAllIds = new Set((editingStep.materials || []).map((material) => material.id));

        // Link newly selected materials
        for (const matId of allSelectedIds) {
          if (!initialAllIds.has(matId)) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
            });
          }
        }
        // Unlink deselected materials
        for (const matId of initialAllIds) {
          if (!allSelectedIds.has(matId)) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: null, unlink_target_id: editingStep.id }),
            });
          }
        }
        setEditStepDialogOpen(false);
        setEditingStep(null);
        setEditStepMaterialIds([]);
        setEditStepMaterials([]);
        fetchRecipes();
        toast.success('步骤已更新');
      }
    } finally {
      setSavingEditStep(false);
    }
  };

  const handleDeleteStep = async (step: RecipeStep) => {
    if (!confirm('确定删除此步骤？')) return;
    const res = await fetch(`/api/recipe-steps/${step.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      fetchRecipes();
      toast.success('步骤已删除');
    }
  };

  const handleDeleteRecipe = (recipe: Recipe) => {
    void attemptNavigation(async () => {
      await recipeDeletion.request({ kind: 'recipe', id: recipe.id, label: recipe.name });
    });
  };

  return (
    <div className="space-y-4">
      <PreviewComponent />

      <div aria-busy={recipeDeletion.state.phase === 'loading'} aria-disabled={recipeDeletion.state.phase === 'loading'} className={cn(recipeDeletion.state.phase === 'loading' && 'pointer-events-none opacity-70')}>
      <FunctionsInputWorkspace
        recipes={recipes}
        focusedRecipeId={focusedRecipeId}
        focusedRecipeStepId={focusedRecipeStepId}
        loading={loading}
        onCreateRecipe={() => setAddDialogOpen(true)}
        onEditRecipe={handleEditRecipe}
        onDeleteRecipe={handleDeleteRecipe}
        deletionBusy={recipeDeletion.state.phase === 'loading' || recipeDeletion.state.phase === 'deleting'}
        onReorderRecipes={async (newRecipes) => {
          await persistOptimisticSort({
            key: `task:${taskId}:recipe-order`,
            previous: recipes,
            next: newRecipes,
            apply: (items) => {
              const ordered = [...items];
              setRecipes(ordered);
              onRecipesChange?.(ordered);
            },
            persist: async (items) => {
              const response = await fetch('/api/recipes', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipes: items.map((recipe, index) => ({ id: recipe.id, sort_order: index })) }),
              });
              await assertSuccessfulSortResponse(response);
            },
          });
        }}
        onAddStep={(recipe) => { setSelectedRecipe(recipe); setAddStepDialogOpen(true); }}
        onEditStep={(step) => handleEditStep(step)}
        onDeleteStep={(step) => handleDeleteStep(step)}
        onReorderSteps={async (recipe, newSteps) => {
          await persistOptimisticSort({
            key: `task:${taskId}:recipe-step-order:${recipe.id}`,
            previous: recipe.recipe_steps || [],
            next: newSteps,
            apply: (items) => {
              const orderedSteps = [...items];
              setRecipes((current) => current.map((item) => (
                item.id === recipe.id ? { ...item, recipe_steps: orderedSteps } : item
              )));
            },
            persist: async (items) => {
              const response = await fetch('/api/recipe-steps', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steps: items.map((step, index) => ({ id: step.id, step_number: index + 1 })) }),
              });
              await assertSuccessfulSortResponse(response);
            },
          });
        }}
        onBindingTargetChange={(target) => onBindingTargetChange?.(target)}
        attemptNavigation={attemptNavigation}
        onRefresh={fetchRecipes}
        onSaveIngredients={async (recipe, items) => {
          const response = await fetch(`/api/recipes/${recipe.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: recipe.name,
              ingredients: recipe.ingredients,
              ingredient_items: items,
              recipe_type: recipe.recipe_type,
              problem_count: recipe.problem_count,
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.code !== 0) throw new Error(data.message || '食材参数保存失败');
          const nextRecipes = recipes.map((item) => item.id === recipe.id ? { ...item, ingredient_items: items } : item);
          setRecipes(nextRecipes);
          onRecipesChange?.(nextRecipes);
        }}
        renderEffectEditor={(recipe) => (
          <RecipeEvaluationPanel
            key={recipe.id}
            taskId={taskId}
            recipe={recipe}
            onRecipeUpdated={(patch) => {
              setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, ...patch } : item));
            }}
          />
        )}
      />
      </div>
      {recipeDeletion.state.phase === 'loading' && <p role="status" className="text-sm text-muted-foreground">正在读取删除影响…</p>}

      <DeletionImpactDialog
        open={recipeDeletion.state.phase === 'confirming' || recipeDeletion.state.phase === 'deleting'}
        targetLabel={recipeDeletion.state.pending?.label ?? ''}
        impact={recipeDeletion.state.impact}
        deleting={recipeDeletion.state.phase === 'deleting'}
        onCancel={recipeDeletion.cancel}
        onConfirm={recipeDeletion.confirm}
      />

      {/* Add recipe dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open);
        if (!open) {
          setRecipeSearch('');
          setRecipeSearchResults([]);
          setNewRecipe({
            name: '',
            ingredients: '',
            recipe_type: '食谱',
            ingredient_items: [{ name: '', quantity: '', unit: '', note: '' }],
          });
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Recipe library search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">从食谱库引用</Label>
              <Input placeholder="搜索已有食谱名称..." value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)} />
              {recipeSearchLoading && <p className="text-xs text-muted-foreground animate-pulse">搜索中...</p>}
              {recipeSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {recipeSearchResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="p-2 rounded-md cursor-pointer text-xs transition-colors border border-transparent hover:bg-muted/50"
                      onClick={() => handleReferenceRecipe(refRecipe)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{refRecipe.recipe_type}</Badge>
                        <span className="font-medium">{refRecipe.name}</span>
                        <span className="text-muted-foreground">{refRecipe.recipe_library_steps?.length || 0}步</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        <span className="text-xs">{refRecipe.product_category || '通用'}{refRecipe.product ? ` - ${refRecipe.product}` : ''}</span>
                        {refRecipe.ingredients && <span className="line-clamp-1 ml-1">{refRecipe.ingredients}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recipeSearch.trim() && !recipeSearchLoading && recipeSearchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={newRecipe.recipe_type} onValueChange={(v) => setNewRecipe({ ...newRecipe, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{newRecipe.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input placeholder={newRecipe.recipe_type === '食谱' ? '如：豆浆食谱' : '如：搅拌功能'}
                value={newRecipe.name} onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{newRecipe.recipe_type === '食谱' ? '食材' : '功能参数'}</Label>
              <Textarea
                placeholder={newRecipe.recipe_type === '食谱' ? '填写食材或配方' : '填写功能参数'}
                value={newRecipe.ingredients}
                onChange={(event) => setNewRecipe({ ...newRecipe, ingredients: event.target.value })}
                rows={2}
              />
            </div>
            <Button onClick={handleAddRecipe} className="w-full" disabled={!newRecipe.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepDialogOpen} onOpenChange={(open) => { setAddStepDialogOpen(open); if (!open) { setStepMaterialIds([]); setStepMaterials([]); setNewStep({ operation: '', step_material_ids: [] }); setStepRefSearch(''); setStepRefResults([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增步骤 - {selectedRecipe?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Step reference search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">引用已有步骤</Label>
              <Input placeholder="搜索食谱名称以引用步骤..." value={stepRefSearch}
                onChange={(e) => setStepRefSearch(e.target.value)} />
              {stepRefLoading && <p className="text-xs text-muted-foreground animate-pulse">搜索中...</p>}
              {stepRefResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {stepRefResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="space-y-1">
                      <div className="text-xs font-medium text-primary">{refRecipe.name}</div>
                      {(refRecipe.recipe_library_steps || []).map((s) => (
                        <div key={s.id} className="p-1.5 rounded cursor-pointer text-xs hover:bg-muted/50 border border-transparent"
                          onClick={() => handleReferenceStep(s as unknown as RecipeStep)}>
                          <span className="text-muted-foreground">步骤{s.step_number}:</span> <span className="line-clamp-1">{s.operation}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {stepRefSearch.trim() && !stepRefLoading && stepRefResults.length === 0 && (
                <p className="text-xs text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={newStep.operation}
                onChange={(e) => setNewStep({ ...newStep, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-xs text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果）</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={newStep.step_material_ids || []}
                onSelectionChange={(ids, mats) => {
                  setNewStep({ ...newStep, step_material_ids: ids });
                  setStepMaterialIds(prev => [...new Set([...prev, ...ids])]);
                  setStepMaterials(mats);
                }}
                enableImageEditing
              />
            </div>
            <Button onClick={handleAddStep} className="w-full" disabled={!newStep.operation || savingStep}>{savingStep ? '保存中...' : '保存步骤'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit step dialog */}
      <Dialog open={editStepDialogOpen} onOpenChange={(open) => { setEditStepDialogOpen(open); if (!open) { setEditingStep(null); setEditStepMaterialIds([]); setEditStepMaterials([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑步骤</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={editStepForm.operation}
                onChange={(e) => setEditStepForm({ ...editStepForm, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-xs text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果）</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={editStepForm.step_material_ids || []}
                initialMaterials={editingStep?.materials || []}
                onSelectionChange={(ids, mats) => {
                  setEditStepForm({ ...editStepForm, step_material_ids: ids });
                  setEditStepMaterialIds(ids);
                  setEditStepMaterials(mats);
                }}
                enableImageEditing
              />
            </div>
            <Button onClick={handleSaveEditStep} className="w-full" disabled={!editStepForm.operation || savingEditStep}>{savingEditStep ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit recipe dialog (Feature 3) */}
      <Dialog open={editRecipeDialogOpen} onOpenChange={setEditRecipeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={editRecipeForm.recipe_type} onValueChange={(v) => setEditRecipeForm({ ...editRecipeForm, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{editRecipeForm.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input value={editRecipeForm.name} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{editRecipeForm.recipe_type === '食谱' ? '食材/配方' : '功能参数'}</Label>
              <Textarea
                value={editRecipeForm.ingredients}
                placeholder={editRecipeForm.recipe_type === '食谱' ? '填写食材或配方' : '填写功能参数'}
                onChange={(event) => setEditRecipeForm({ ...editRecipeForm, ingredients: event.target.value })}
                rows={3}
              />
            </div>
            <Button onClick={handleSaveEditRecipe} className="w-full" disabled={!editRecipeForm.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
