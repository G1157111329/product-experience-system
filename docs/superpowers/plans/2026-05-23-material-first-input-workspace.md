# Material-First Input Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild task detail authoring around material evidence first, then structured five-senses and function/effect input, with an optional narrow Agent assist panel.

**Architecture:** Keep existing APIs and data tables. Add focused task-detail components for the authoring shell, evidence rail, Agent panel, five-senses workspace, and function workspace; integrate them incrementally so the existing dialogs remain as fallback until each new workflow is stable.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Tailwind CSS 4, shadcn/ui, existing `/api/materials`, `/api/records`, `/api/recipes`, `/api/recipe-steps`, `/api/tasks/[id]/ai-summary`, and current AI agent files.

---

## Scope And Constraints

- The source of truth remains task detail data: materials, check records, recipes, recipe steps, effect evaluation.
- Do not turn report center into a review workflow. Report center stays output/share/export oriented.
- Do not create new database tables for this UI pass.
- Keep AI agent files in the final GitHub update. The current branch already contains AI agent work; do not discard it.
- Default desktop task detail layout is two columns: left input directory, right input workspace.
- Agent assist is opt-in. The left AI icon toggles a narrow right panel, about `260px-300px`.
- Material evidence appears at the top of the input workspace and is shared by senses and functions.
- Existing dialogs remain available as fallback during migration.

## File Structure

Create:

- `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
  - Owns two-column / three-column desktop layout and mobile stacking.
  - Owns left directory and AI assist toggle.

- `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`
  - Shared top evidence rail for task materials.
  - Handles upload/capture/preview/filter/selection.

- `src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx`
  - Narrow opt-in Agent panel.
  - Reuses report readiness output as suggestions, not a constant readiness sidebar.

- `src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx`
  - Five-senses list + current-record editor.
  - Starts as a wrapper around existing record data and opens legacy dialog for full editing.

- `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
  - Recipe/function list + step timeline + effect panel.
  - Starts as a wrapper around the existing functions implementation and progressively absorbs high-frequency editing.

Modify:

- `src/app/(main)/tasks/[id]/page.tsx`
  - Replace the current tab + fixed `ReportInputPanel` layout with `ReportAuthoringShell`.
  - Keep old tab content available while new workspaces are introduced.

- `src/app/(main)/tasks/[id]/types.ts`
  - Add shared authoring types for material filters, selected evidence, and evidence binding targets.

- `src/app/(main)/tasks/[id]/components/materials-tab.tsx`
  - Reuse upload/rename/delete logic from this file inside `MaterialEvidenceRail`, then keep `MaterialsTab` as a full material management page if needed.

- `src/app/(main)/tasks/[id]/components/report-input-panel.tsx`
  - Stop rendering it as a constant right sidebar.
  - Either move its useful readiness item rendering into `AgentAssistPanel`, or leave it unused until deletion is safe.

- `src/app/(main)/tasks/[id]/components/agent-preset-panel.tsx`
  - Keep existing AI preset behavior.
  - Expose it from the Agent assist area or left directory without duplicating buttons.

Test/verify:

- `corepack pnpm ts-check`
- targeted ESLint for touched files
- `corepack pnpm exec next build`
- Browser check on desktop width and mobile width

---

## Task 1: Shared Authoring Types

**Files:**
- Modify: `src/app/(main)/tasks/[id]/types.ts`

- [ ] **Step 1: Add authoring state types**

Add these exports near the existing `Material` type:

```ts
export type MaterialEvidenceFilter = 'all' | 'unlinked' | 'linked' | 'image' | 'video' | 'senses' | 'functions' | 'effect';

export type EvidenceBindingTarget =
  | { type: 'record'; id: string; label: string }
  | { type: 'recipe_step'; id: string; label: string }
  | { type: 'recipe_effect'; id: string; label: string };

export type AuthoringSection = 'materials' | 'senses' | 'functions' | 'summary';
```

- [ ] **Step 2: Run type check**

Run: `corepack pnpm ts-check`

Expected: existing project type check status is preserved. New exported types should not introduce errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/tasks/[id]/types.ts"
git commit -m "feat: add task authoring shared types"
```

---

## Task 2: Material Evidence Rail

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Create the component skeleton**

Create `material-evidence-rail.tsx` with:

```tsx
'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Film, Image as ImageIcon, Link2, Package, Play, RefreshCw, Upload, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { MediaCaptureDialog } from '@/components/media-capture-dialog';
import { useImagePreview } from '@/components/image-preview';
import { cn } from '@/lib/utils';
import type { EvidenceBindingTarget, Material, MaterialEvidenceFilter } from '../types';

type MaterialEvidenceRailProps = {
  taskId: string;
  bindingTarget: EvidenceBindingTarget | null;
  onMaterialsChange?: (materials: Material[]) => void;
};

const filters: Array<{ key: MaterialEvidenceFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unlinked', label: '未关联' },
  { key: 'linked', label: '已关联' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'senses', label: '五感' },
  { key: 'functions', label: '步骤' },
  { key: 'effect', label: '效果' },
];

function isLinked(material: Material) {
  return Boolean(material.record_id || material.recipe_step_id || material.recipe_id);
}

function matchesFilter(material: Material, filter: MaterialEvidenceFilter) {
  if (filter === 'all') return true;
  if (filter === 'unlinked') return !isLinked(material);
  if (filter === 'linked') return isLinked(material);
  if (filter === 'image') return material.material_type === 'image';
  if (filter === 'video') return material.material_type === 'video';
  if (filter === 'senses') return Boolean(material.record_id);
  if (filter === 'functions') return Boolean(material.recipe_step_id);
  if (filter === 'effect') return Boolean(material.recipe_id);
  return true;
}

export function MaterialEvidenceRail({ taskId, bindingTarget, onMaterialsChange }: MaterialEvidenceRailProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState<MaterialEvidenceFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { open, PreviewComponent } = useImagePreview();

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/materials?task_id=${taskId}`);
      const data = await res.json();
      const nextMaterials = data.code === 0 ? data.data || [] : [];
      setMaterials(nextMaterials);
      onMaterialsChange?.(nextMaterials);
    } finally {
      setLoading(false);
    }
  }, [onMaterialsChange, taskId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const filteredMaterials = useMemo(
    () => materials.filter((material) => matchesFilter(material, filter)),
    [filter, materials]
  );

  const unlinkedCount = materials.filter((material) => !isLinked(material)).length;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleUpload = async (files: File[] | FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} 超过100MB`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        const toastId = `upload-${file.name}`;
        toast.loading(`正在上传 ${file.name}...`, { id: toastId });

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);
          const res = await fetch('/api/materials/upload', { method: 'POST', body: formData, signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (data.code === 0) toast.success(`${file.name} 上传成功`, { id: toastId });
          else toast.error(data.message || '上传失败', { id: toastId });
        } catch {
          toast.error('上传失败', { id: toastId });
        }
      }

      await fetchMaterials();
    } finally {
      setUploading(false);
    }
  };

  const handleBindSelected = async () => {
    if (!bindingTarget || selectedIds.length === 0) return;

    const payload =
      bindingTarget.type === 'record'
        ? { record_id: bindingTarget.id, recipe_step_id: null, recipe_id: null }
        : bindingTarget.type === 'recipe_step'
          ? { recipe_step_id: bindingTarget.id, record_id: null, recipe_id: null }
          : { recipe_id: bindingTarget.id, record_id: null, recipe_step_id: null };

    await Promise.all(
      selectedIds.map((id) =>
        fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...payload }),
        })
      )
    );

    toast.success(`已绑定 ${selectedIds.length} 个素材`);
    setSelectedIds([]);
    await fetchMaterials();
  };

  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <PreviewComponent />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">素材证据</h2>
            <Badge variant="secondary">{materials.length} 个素材</Badge>
            {unlinkedCount > 0 && <Badge variant="outline">{unlinkedCount} 个未关联</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">先整理手机拍摄的图片/视频，再绑定到五感记录、功能步骤或效果评价。</p>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:flex">
          <Button variant="outline" size="sm" onClick={() => setCaptureMode('image')} disabled={uploading}>
            <Camera className="mr-1.5 h-4 w-4" />拍照
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCaptureMode('video')} disabled={uploading}>
            <Video className="mr-1.5 h-4 w-4" />录像
          </Button>
          <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
            <ImageIcon className="mr-1.5 h-4 w-4" />图片
          </Button>
          <Button variant="outline" size="sm" onClick={() => videoInputRef.current?.click()} disabled={uploading}>
            <Film className="mr-1.5 h-4 w-4" />视频
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              filter === item.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >
            {item.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={fetchMaterials} className="ml-auto">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>

      <ScrollArea className="mt-3 w-full">
        <div className="flex gap-2 pb-3">
          {loading ? (
            [1, 2, 3, 4, 5].map((item) => <div key={item} className="h-24 w-32 shrink-0 animate-pulse rounded-lg bg-muted" />)
          ) : filteredMaterials.length === 0 ? (
            <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              <Package className="mr-2 h-4 w-4" />暂无匹配素材
            </div>
          ) : (
            filteredMaterials.map((material) => {
              const selected = selectedIds.includes(material.id);
              return (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => toggleSelected(material.id)}
                  onDoubleClick={() => open(material.file_url)}
                  className={cn(
                    'group relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border text-left transition',
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                  )}
                >
                  {material.material_type === 'image' ? (
                    <img src={material.file_url} alt={material.file_name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video src={material.file_url} className="h-full w-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </div>
                    </>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <div className="truncate text-[10px] text-white">{material.file_name}</div>
                  </div>
                  <div className="absolute left-1.5 top-1.5 rounded-full bg-background/90 p-1">
                    {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-center">
          <div className="text-sm text-muted-foreground">已选择 {selectedIds.length} 个素材</div>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              <X className="mr-1.5 h-4 w-4" />取消
            </Button>
            <Button size="sm" onClick={handleBindSelected} disabled={!bindingTarget}>
              <Link2 className="mr-1.5 h-4 w-4" />
              {bindingTarget ? `绑定到${bindingTarget.label}` : '先选择记录/步骤'}
            </Button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <MediaCaptureDialog
        mode={captureMode || 'image'}
        open={captureMode !== null}
        onOpenChange={(open) => setCaptureMode(open ? (captureMode || 'image') : null)}
        onCapture={(file) => handleUpload([file])}
        busy={uploading}
      />
    </section>
  );
}
```

- [ ] **Step 2: Install or verify `ScrollArea` availability**

Run: `Test-Path "src/components/ui/scroll-area.tsx"`

Expected: `True`. If false, replace `ScrollArea` and `ScrollBar` with a plain `div className="overflow-x-auto"`.

- [ ] **Step 3: Wire the rail above the active input module**

In `page.tsx`, add:

```ts
import { MaterialEvidenceRail } from './components/material-evidence-rail';
import type { EvidenceBindingTarget } from './types';
```

Add state near `activeTab`:

```ts
const [evidenceBindingTarget, setEvidenceBindingTarget] = useState<EvidenceBindingTarget | null>(null);
```

Render the rail above tab content for `materials`, `senses`, and `functions` sections:

```tsx
{activeTab !== 'info' && (
  <MaterialEvidenceRail
    taskId={id}
    bindingTarget={evidenceBindingTarget}
    onMaterialsChange={() => {
      fetchTask();
      fetchReportRecipes();
    }}
  />
)}
```

- [ ] **Step 4: Run checks**

Run:

```bash
corepack pnpm ts-check
corepack pnpm exec eslint --% "src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx" "src/app/(main)/tasks/[id]/page.tsx"
```

Expected: both commands complete without new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx" "src/app/(main)/tasks/[id]/page.tsx"
git commit -m "feat: add material-first evidence rail"
```

---

## Task 3: Authoring Shell And Agent Toggle

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`
- Create: `src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/report-input-panel.tsx` only if needed for reused readiness rendering

- [ ] **Step 1: Create `AgentAssistPanel`**

Create a narrow panel that receives readiness, active tab, and tab change callback:

```tsx
'use client';

import { AlertTriangle, Bot, CheckCircle2, CircleDot, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ReportReadinessItem, ReportReadinessResult } from '@/lib/report-readiness';

type TaskTabKey = 'info' | 'materials' | 'senses' | 'functions';

type AgentAssistPanelProps = {
  readiness: ReportReadinessResult | null;
  activeTab: TaskTabKey;
  onTabChange: (tab: TaskTabKey) => void;
  onClose: () => void;
};

const itemTabMap: Record<string, TaskTabKey> = {
  'basic-info': 'info',
  records: 'senses',
  'record-problem-description': 'senses',
  'record-evidence': 'senses',
  recipes: 'functions',
  'recipe-effect-description': 'functions',
  'recipe-step-evidence': 'functions',
  'raw-json-problem-points': 'functions',
  'ai-summary': 'info',
};

function getItemIcon(item: ReportReadinessItem) {
  if (item.status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (item.severity === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <CircleDot className="h-4 w-4 text-amber-600" />;
}

export function AgentAssistPanel({ readiness, activeTab, onTabChange, onClose }: AgentAssistPanelProps) {
  const attentionItems = readiness?.items.filter((item) => item.status !== 'ok') || [];

  return (
    <aside className="rounded-lg border bg-card shadow-sm lg:sticky lg:top-4 lg:w-[280px]">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Agent 辅助</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">按需检查缺口、定位素材、辅助总结。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <ScrollArea className="h-[min(560px,calc(100dvh-12rem))]">
        <div className="space-y-3 p-3">
          {readiness && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">输入完整度</span>
                <Badge variant={readiness.status === 'ready' ? 'default' : readiness.status === 'attention' ? 'secondary' : 'destructive'}>
                  {readiness.score}/100
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {attentionItems.length > 0 ? `还有 ${attentionItems.length} 项建议确认。` : '关键输入已经完整。'}
              </p>
            </div>
          )}

          {attentionItems.slice(0, 6).map((item) => {
            const targetTab = itemTabMap[item.id] || activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(targetTab)}
                className={cn(
                  'w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/50',
                  item.status === 'ok' ? 'bg-background' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{getItemIcon(item)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                  </span>
                </div>
              </button>
            );
          })}

          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" /> 素材建议
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              优先处理未关联素材。选择一条五感记录、步骤或效果评价后，可从顶部素材证据栏直接绑定图片/视频。
            </p>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
```

- [ ] **Step 2: Create `ReportAuthoringShell`**

Create:

```tsx
'use client';

import { Bot, Eye, FileText, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentAssistPanel } from './agent-assist-panel';
import type { ReportReadinessResult } from '@/lib/report-readiness';

type TaskTabKey = 'info' | 'materials' | 'senses' | 'functions';

type ReportAuthoringShellProps = {
  activeTab: TaskTabKey;
  agentOpen: boolean;
  readiness: ReportReadinessResult | null;
  onTabChange: (tab: TaskTabKey) => void;
  onAgentOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

const navItems: Array<{ key: TaskTabKey; label: string; icon: React.ComponentType<{ className?: string }> | null }> = [
  { key: 'materials', label: '素材证据', icon: Package },
  { key: 'senses', label: '五感体验', icon: Eye },
  { key: 'functions', label: '功能效果', icon: Wrench },
  { key: 'info', label: 'AI总结/报告', icon: FileText },
];

export function ReportAuthoringShell({
  activeTab,
  agentOpen,
  readiness,
  onTabChange,
  onAgentOpenChange,
  children,
}: ReportAuthoringShellProps) {
  return (
    <div className={cn('grid gap-4 lg:items-start', agentOpen ? 'lg:grid-cols-[220px_minmax(0,1fr)_280px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]')}>
      <aside className="rounded-lg border bg-card p-3 shadow-sm lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">录入目录</h2>
            <p className="text-xs text-muted-foreground">先素材，再组织记录。</p>
          </div>
          <Button
            variant={agentOpen ? 'default' : 'outline'}
            size="icon"
            className="h-9 w-9"
            onClick={() => onAgentOpenChange(!agentOpen)}
            aria-label={agentOpen ? '关闭 Agent 辅助' : '唤醒 Agent 辅助'}
          >
            <Bot className="h-4 w-4" />
          </Button>
        </div>

        <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                activeTab === item.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 hover:bg-muted'
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-4">{children}</div>

      {agentOpen && (
        <AgentAssistPanel
          readiness={readiness}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onClose={() => onAgentOpenChange(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace old right sidebar in `page.tsx`**

Remove the grid that renders `ReportInputPanel` as a constant right panel. Add:

```ts
import { ReportAuthoringShell } from './components/report-authoring-shell';
```

Add state:

```ts
const [agentAssistOpen, setAgentAssistOpen] = useState(false);
```

Wrap evidence rail and tab content:

```tsx
<ReportAuthoringShell
  activeTab={activeTab}
  agentOpen={agentAssistOpen}
  readiness={reportReadiness}
  onTabChange={setActiveTab}
  onAgentOpenChange={setAgentAssistOpen}
>
  {activeTab !== 'info' && (
    <MaterialEvidenceRail
      taskId={id}
      bindingTarget={evidenceBindingTarget}
      onMaterialsChange={() => {
        fetchTask();
        fetchReportRecipes();
      }}
    />
  )}

  {activeTab === 'info' && <BasicInfoTab task={task} onRefresh={fetchTask} />}
  {activeTab === 'materials' && <MaterialsTab taskId={id} />}
  {activeTab === 'senses' && (
    <SensesTab
      taskId={id}
      records={task.records || []}
      taskProductCategory={task.product_category}
      taskProduct={task.product}
      onRefresh={fetchTask}
      onStatusUpdate={() => updateTaskStatusIfNeeded('add_content')}
    />
  )}
  {activeTab === 'functions' && (
    <FunctionsTab
      taskId={id}
      onStatusUpdate={() => updateTaskStatusIfNeeded('add_content')}
      onRecipesChange={setReportRecipes}
    />
  )}
</ReportAuthoringShell>
```

- [ ] **Step 4: Run checks**

Run:

```bash
corepack pnpm ts-check
corepack pnpm exec eslint --% "src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx" "src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx" "src/app/(main)/tasks/[id]/page.tsx"
```

Expected: no new TypeScript or lint errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx" "src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx" "src/app/(main)/tasks/[id]/page.tsx"
git commit -m "feat: add material-first authoring shell"
```

---

## Task 4: Five-Senses Input Workspace

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Create first-pass workspace**

Create a component that presents records as the primary UI and still delegates full edits to the existing `SensesTab` fallback through props:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Filter, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CheckRecord, EvidenceBindingTarget } from '../types';

type SensesInputWorkspaceProps = {
  records: CheckRecord[];
  onCreateRecord: () => void;
  onEditRecord: (record: CheckRecord) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
};

function getRecordTitle(record: CheckRecord) {
  return record.check_item || record.check_standard || record.experience_standard || '未命名检查项';
}

export function SensesInputWorkspace({ records, onCreateRecord, onEditRecord, onBindingTargetChange }: SensesInputWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(records[0]?.id || '');
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || records[0] || null,
    [records, selectedId]
  );

  const failedRecords = records.filter((record) => record.evaluation_result === '不合格');

  const selectRecord = (record: CheckRecord) => {
    setSelectedId(record.id);
    onBindingTargetChange({ type: 'record', id: record.id, label: '当前五感记录' });
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)]">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">五感体验记录</h2>
            <p className="mt-1 text-xs text-muted-foreground">{records.length} 条记录，{failedRecords.length} 条不合格</p>
          </div>
          <Button size="sm" onClick={onCreateRecord}>
            <Plus className="mr-1.5 h-4 w-4" />新增
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary"><Filter className="mr-1 h-3 w-3" />全部</Badge>
          <Badge variant="outline">不合格 {failedRecords.length}</Badge>
        </div>

        <div className="mt-3 space-y-2">
          {records.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无五感记录，点击新增开始录入。
            </div>
          ) : (
            records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => selectRecord(record)}
                className={cn(
                  'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                  selectedRecord?.id === record.id ? 'border-primary bg-primary/5' : 'bg-background'
                )}
              >
                <div className="flex items-start gap-2">
                  {record.evaluation_result === '合格' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{getRecordTitle(record)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">{record.standard_category || '未分类'}</Badge>
                      <Badge variant={record.evaluation_result === '合格' ? 'secondary' : 'destructive'} className="text-[10px]">
                        {record.evaluation_result}
                      </Badge>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 shadow-sm">
        {selectedRecord ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{getRecordTitle(selectedRecord)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">选择这条记录后，顶部素材证据栏可直接绑定图片/视频。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onEditRecord(selectedRecord)}>完整编辑</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">标准类型</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.standard_category || '-'}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">检查结果</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.evaluation_result}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">问题等级</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.problem_level || '-'}</div>
              </div>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">问题描述</div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{selectedRecord.problem_description || '暂无问题描述'}</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            选择一条记录查看详情
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Expose create/edit handlers from existing `SensesTab`**

If `SensesTab` is still inline in `page.tsx`, do not fully extract it in this task. Instead add wrapper callbacks inside the inline component:

```ts
const openCreateRecordDialog = () => {
  setEditRecordId(null);
  resetForm();
  setDialogOpen(true);
};

const openEditRecordDialog = (record: CheckRecord) => {
  handleEditRecord(record);
};
```

Then render `SensesInputWorkspace` before or instead of the old grouped record list. Keep the existing dialog JSX unchanged.

- [ ] **Step 3: Wire binding target**

Pass `setEvidenceBindingTarget` from `page.tsx` down to the senses workspace. When a record is selected, evidence rail should bind selected media to that record.

- [ ] **Step 4: Run checks**

Run:

```bash
corepack pnpm ts-check
corepack pnpm exec eslint --% "src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx" "src/app/(main)/tasks/[id]/page.tsx"
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx" "src/app/(main)/tasks/[id]/page.tsx"
git commit -m "feat: add five-senses input workspace"
```

---

## Task 5: Functions Input Workspace

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx` or `src/app/(main)/tasks/[id]/components/functions-tab.tsx`, depending on which version is active after Task 4

- [ ] **Step 1: Create first-pass workspace**

Create a component that exposes the recipe/function list and selected function detail:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { ChefHat, ClipboardList, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvidenceBindingTarget, Recipe, RecipeStep } from '../types';

type FunctionsInputWorkspaceProps = {
  recipes: Recipe[];
  onCreateRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onAddStep: (recipe: Recipe) => void;
  onEditStep: (step: RecipeStep, recipe: Recipe) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
};

export function FunctionsInputWorkspace({
  recipes,
  onCreateRecipe,
  onEditRecipe,
  onAddStep,
  onEditStep,
  onBindingTargetChange,
}: FunctionsInputWorkspaceProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id || '');
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0] || null,
    [recipes, selectedRecipeId]
  );

  const selectRecipe = (recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    onBindingTargetChange({ type: 'recipe_effect', id: recipe.id, label: '当前效果评价' });
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">功能/食谱</h2>
            <p className="mt-1 text-xs text-muted-foreground">{recipes.length} 个功能项</p>
          </div>
          <Button size="sm" onClick={onCreateRecipe}>
            <Plus className="mr-1.5 h-4 w-4" />新增
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => selectRecipe(recipe)}
              className={cn(
                'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                selectedRecipe?.id === recipe.id ? 'border-primary bg-primary/5' : 'bg-background'
              )}
            >
              <div className="flex items-start gap-2">
                <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{recipe.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">{recipe.recipe_steps?.length || 0} 步</Badge>
                    <Badge variant={recipe.effect_description ? 'secondary' : 'outline'} className="text-[10px]">
                      {recipe.effect_description ? '有效果评价' : '缺效果评价'}
                    </Badge>
                    {recipe.effect_score && <Badge className="text-[10px]">{recipe.effect_score} 分</Badge>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {selectedRecipe ? (
          <>
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{selectedRecipe.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedRecipe.ingredients || '暂无参数/食材'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onEditRecipe(selectedRecipe)}>编辑功能</Button>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">步骤时间线</h3>
                <Button variant="outline" size="sm" onClick={() => onAddStep(selectedRecipe)}>
                  <Plus className="mr-1.5 h-4 w-4" />新增步骤
                </Button>
              </div>
              <div className="space-y-2">
                {(selectedRecipe.recipe_steps || []).map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onBindingTargetChange({ type: 'recipe_step', id: step.id, label: `步骤 ${step.step_number}` })}
                    onDoubleClick={() => onEditStep(step, selectedRecipe)}
                    className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {step.step_number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{step.operation || '暂无操作说明'}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">{step.materials?.length || 0} 个素材</Badge>
                          {step.problem_point && <Badge variant="destructive" className="text-[10px]">有问题点</Badge>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">效果/出品评价</h3>
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="text-sm whitespace-pre-wrap">{selectedRecipe.effect_description || '暂无效果描述'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedRecipe.effect_materials?.length || 0} 个效果素材</Badge>
                  {selectedRecipe.effect_score && <Badge>{selectedRecipe.effect_score} 分</Badge>}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            <ClipboardList className="mr-2 h-4 w-4" />选择或新增一个功能
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire to existing functions logic**

Use the existing functions state and handlers. The first pass can render `FunctionsInputWorkspace` above the existing detailed card list, then progressively remove duplicate blocks after verification.

- [ ] **Step 3: Wire binding target**

Selecting a step sets:

```ts
{ type: 'recipe_step', id: step.id, label: `步骤 ${step.step_number}` }
```

Selecting effect evaluation sets:

```ts
{ type: 'recipe_effect', id: recipe.id, label: '当前效果评价' }
```

- [ ] **Step 4: Run checks**

Run:

```bash
corepack pnpm ts-check
corepack pnpm exec eslint --% "src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx" "src/app/(main)/tasks/[id]/page.tsx" "src/app/(main)/tasks/[id]/components/functions-tab.tsx"
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx" "src/app/(main)/tasks/[id]/page.tsx" "src/app/(main)/tasks/[id]/components/functions-tab.tsx"
git commit -m "feat: add functions input workspace"
```

---

## Task 6: Remove Duplicate Report-Readiness Sidebar Behavior

**Files:**
- Modify: `src/app/(main)/tasks/[id]/components/report-input-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Confirm `ReportInputPanel` is no longer rendered**

Run:

```bash
rg -n "ReportInputPanel" "src/app/(main)/tasks/[id]"
```

Expected after Task 3: only the component file may remain. `page.tsx` should not import or render it.

- [ ] **Step 2: Delete or keep as dead-safe**

If no imports remain, delete `report-input-panel.tsx`. If the team prefers a fallback, keep it but remove corrupted text and add a comment at top:

```ts
// Legacy report readiness panel. New task detail uses AgentAssistPanel.
```

Preferred first pass: keep it only if it reduces merge risk. Remove in a cleanup commit after the UI is stable.

- [ ] **Step 3: Run checks**

Run:

```bash
corepack pnpm ts-check
corepack pnpm exec eslint --% "src/app/(main)/tasks/[id]/page.tsx"
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(main)/tasks/[id]/page.tsx" "src/app/(main)/tasks/[id]/components/report-input-panel.tsx"
git commit -m "refactor: move readiness checks into agent assist"
```

---

## Task 7: Visual And Interaction Verification

**Files:**
- No source files unless verification finds a bug.

- [ ] **Step 1: Run full verification**

Run:

```bash
corepack pnpm ts-check
corepack pnpm lint
corepack pnpm exec next build
```

Expected:

- Type check passes.
- Lint should pass after fixing existing AI agent lint items that are in this branch.
- Build passes.

- [ ] **Step 2: Start dev server**

Run:

```bash
corepack pnpm dev
```

Expected: Next dev server starts on the configured port.

- [ ] **Step 3: Desktop manual check**

Open a task detail page and verify:

- Default layout shows left directory and right input area.
- Material evidence rail is at the top of the input area.
- Images and videos are visibly large enough to judge content.
- Clicking the left AI icon opens a narrow right Agent panel.
- Closing Agent returns to two columns.
- Selecting a five-senses record lets selected evidence bind to that record.
- Selecting a function step lets selected evidence bind to that step.

- [ ] **Step 4: Mobile manual check**

At around `390px` width verify:

- No horizontal scroll.
- Left directory stacks above input modules.
- Material evidence rail remains before the current form.
- Agent does not appear as a full right column.

- [ ] **Step 5: Commit visual fixes**

If changes were needed:

```bash
git add "src/app/(main)/tasks/[id]"
git commit -m "fix: polish material-first task input layout"
```

---

## Task 8: Final GitHub Update Including AI Agent Files

**Files:**
- Include all task input UI files from this plan.
- Include existing AI agent files already in the worktree:
  - `src/app/(main)/tasks/[id]/components/agent-preset-panel.tsx`
  - `src/app/api/ai/`
  - `src/app/api/tasks/[id]/agent-presets/`
  - `src/components/settings/`
  - `src/lib/agent-skills.ts`
  - `src/lib/agent-skills.test.ts`
  - `src/lib/server/agent-skills.ts`
  - `src/lib/server/ai.ts`
  - `src/lib/server/ai.test.ts`
  - `src/storage/database/shared/schema.ts`
  - `docs/superpowers/plans/2026-05-23-ai-agent-skills-implementation.md`
  - `docs/superpowers/sql/`

- [ ] **Step 1: Review branch and remote**

Run:

```bash
git branch --show-current
git remote -v
git status --short
```

Expected: know whether the working branch is `main` or `ai-agent-skills`.

- [ ] **Step 2: Fix AI agent lint before final push**

Known current issues to check:

```bash
corepack pnpm exec eslint --% "src/lib/server/agent-skills.ts" "src/components/navigation.tsx"
```

Fix:

- Replace `any` in `src/lib/server/agent-skills.ts` with specific `unknown` / typed records.
- Remove or use unused `AiConfigSettings` import in `src/components/navigation.tsx`.

- [ ] **Step 3: Run final verification**

Run:

```bash
corepack pnpm ts-check
corepack pnpm lint
corepack pnpm exec next build
```

Expected: all pass.

- [ ] **Step 4: Commit all intended changes**

Run:

```bash
git status --short
git add docs/superpowers/specs/2026-05-23-hybrid-report-authoring-design.md
git add docs/superpowers/plans/2026-05-23-material-first-input-workspace.md
git add docs/superpowers/plans/2026-05-23-ai-agent-skills-implementation.md
git add docs/superpowers/sql
git add "src/app/(main)/tasks/[id]"
git add "src/app/api/ai"
git add "src/app/api/tasks/[id]/agent-presets"
git add "src/components/settings"
git add "src/components/navigation.tsx"
git add "src/lib/agent-skills.ts" "src/lib/agent-skills.test.ts" "src/lib/server/agent-skills.ts" "src/lib/server/ai.ts" "src/lib/server/ai.test.ts"
git add "src/storage/database/shared/schema.ts"
git commit -m "feat: add material-first task input workspace"
```

- [ ] **Step 5: Update GitHub**

If already on `main`:

```bash
git push origin main
```

If on `ai-agent-skills` and user still wants GitHub `main`, use a non-destructive path:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only ai-agent-skills
git push origin main
```

If fast-forward is not possible, stop and report the conflict summary before pushing.

---

## Self-Review

- Spec coverage:
  - Material-first workspace: Task 2 and Task 3.
  - Optional Agent narrow panel: Task 3.
  - Five-senses workflow: Task 4.
  - Function/effect workflow: Task 5.
  - Report center not becoming review workflow: Task 6 and no report-center changes.
  - Final GitHub update with AI agent files: Task 8.
- Placeholder scan:
  - No placeholder markers are used.
  - Where implementation is intentionally incremental, exact fallback behavior is stated.
- Type consistency:
  - `EvidenceBindingTarget`, `MaterialEvidenceFilter`, and `AuthoringSection` are defined in Task 1 and reused consistently.
