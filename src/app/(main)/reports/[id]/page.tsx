'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { PageShell } from '@/components/app';
import { useImagePreview } from '@/components/image-preview';
import { IssueRectificationDialog, type IssueForRectification } from '@/components/issues/issue-rectification-dialog';
import { ReportStickyHeader } from './components/report-sticky-header';
import { ReportTabBar } from './components/report-tab-bar';
import { ReportSummaryTab } from './components/report-summary-tab';
import { ReportIssuesTab } from './components/report-issues-tab';
import { ReportMatrixTab, type MatrixData } from './components/report-matrix-tab';
import { ReportFunctionEffectTab } from './components/report-function-effect-tab';
import { Loader2 } from 'lucide-react';

interface HeaderData {
  id: string;
  title: string;
  productModel: string | null;
  status: string;
  reportType: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectPhase: string | null;
  projectType?: string | null;
  aiSummary?: Record<string, unknown> | null;
  version: number;
  availableTabs: string[];
}

interface SummaryData {
  aiSummary: Record<string, unknown> | null;
  taskInfo: Record<string, unknown> | null;
  stats: {
    totalCheckItems: number;
    passCount: number;
    failCount: number;
    issueCount: number;
    recipeCount: number;
  };
  conclusion: { level: string; text: string };
  matrixType: 'multi_matrix' | 'single_waterfall' | null;
}

interface IssueItem extends IssueForRectification {
  occurrenceCount?: number;
  historyCount?: number;
  occurrenceTimeline?: Array<Record<string, unknown>>;
  rectificationHistory?: Array<Record<string, unknown>>;
  materials?: Array<Record<string, unknown>>;
}

const TAB_LABELS: Record<string, string> = {
  summary: '总结',
  issues: '问题',
  matrix: '矩阵',
  function_effect: '功能效果',
};

export default function ReportDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const legacy = searchParams.get('v') === '3' || searchParams.get('legacy') === '1';

  const [header, setHeader] = useState<HeaderData | null>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [issues, setIssues] = useState<IssueItem[] | null>(null);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [functionEffect, setFunctionEffect] = useState<{ recipes: Array<Record<string, unknown>> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rectificationOpen, setRectificationOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const { PreviewComponent } = useImagePreview();

  // V3 legacy redirect
  useEffect(() => {
    if (legacy) {
      window.location.href = `/reports/legacy/${id}`;
    }
  }, [legacy, id]);

  const fetchHeader = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${id}/header`);
      const data = await res.json();
      if (data.code === 0) {
        setHeader(data.data);
      } else {
        setLoadError(data.message || '报告加载失败');
      }
    } catch {
      setLoadError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchHeader();
  }, [fetchHeader]);

  const fetchSummary = useCallback(async () => {
    if (summary) return;
    const res = await fetch(`/api/reports/${id}/summary`);
    const data = await res.json();
    if (data.code === 0) setSummary(data.data);
  }, [id, summary]);

  const fetchIssues = useCallback(async () => {
    if (issues) return;
    const res = await fetch(`/api/reports/${id}/issues`);
    const data = await res.json();
    if (data.code === 0) setIssues(data.data || []);
  }, [id, issues]);

  const fetchMatrix = useCallback(async () => {
    if (matrix) return;
    const res = await fetch(`/api/reports/${id}/matrix`);
    const data = await res.json();
    if (data.code === 0) setMatrix(data.data);
  }, [id, matrix]);

  const fetchFunctionEffect = useCallback(async () => {
    if (functionEffect) return;
    const res = await fetch(`/api/reports/${id}/function-effect`);
    const data = await res.json();
    if (data.code === 0) setFunctionEffect(data.data);
  }, [id, functionEffect]);

  useEffect(() => {
    if (!header) return;
    if (activeTab === 'summary') void fetchSummary();
    if (activeTab === 'issues') void fetchIssues();
    if (activeTab === 'matrix') void fetchMatrix();
    if (activeTab === 'function_effect') void fetchFunctionEffect();
  }, [activeTab, header, fetchSummary, fetchIssues, fetchMatrix, fetchFunctionEffect]);

  const handleOpenRectification = (issue: IssueItem) => {
    setEditingIssue(issue);
    setRectificationOpen(true);
  };

  const handleRectificationSaved = (updated: IssueForRectification) => {
    setIssues((prev) => {
      if (!prev) return prev;
      return prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i));
    });
  };

  const handleExportPDF = async () => {
    // 统一走打印预览页（先预览加载图片转 base64，再唤醒浏览器打印）
    // 对比报告和普通报告都走同一流程，确保图片可见
    const opened = window.open(`/reports/print?id=${id}&mode=fast`, '_blank');
    if (!opened) {
      toast.error('浏览器阻止了新窗口');
      return;
    }
    toast.success('打印导出页已打开');
  };

  if (legacy) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2">正在切换到旧版报告视图...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-16 bg-muted rounded" />
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!header || loadError) {
    return (
      <PageShell className="p-6 space-y-3">
        <p className="text-muted-foreground">{loadError || '报告不存在'}</p>
        <Button variant="outline" onClick={() => fetchHeader()}>重试</Button>
      </PageShell>
    );
  }

  const tabs = header.availableTabs.map((key) => ({
    key,
    label: TAB_LABELS[key] || key,
    count: key === 'issues' ? issues?.length ?? undefined : undefined,
  }));

  return (
    <PageShell size="wide" className="space-y-0">
      <PreviewComponent />
      <ReportStickyHeader
        id={header.id}
        title={header.title}
        productModel={header.productModel}
        status={header.status}
        reportType={header.reportType}
        projectPhase={header.projectPhase}
        projectType={header.projectType}
        taskTitle={header.taskTitle}
        aiSummary={header.aiSummary}
        onExport={handleExportPDF}
      />
      <ReportTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="min-h-[400px] pb-8">
        {activeTab === 'summary' && (
          summary ? <ReportSummaryTab data={summary} /> : <SkeletonTab />
        )}
        {activeTab === 'issues' && (
          issues ? (
            <ReportIssuesTab issues={issues} onStatusClick={handleOpenRectification} />
          ) : (
            <SkeletonTab />
          )
        )}
        {activeTab === 'matrix' && (
          matrix ? (
            <ReportMatrixTab data={matrix as MatrixData} />
          ) : (
            <SkeletonTab />
          )
        )}
        {activeTab === 'function_effect' && (
          functionEffect ? (
            <ReportFunctionEffectTab recipes={(functionEffect.recipes as never[]) || []} />
          ) : (
            <SkeletonTab />
          )
        )}
      </div>

      <IssueRectificationDialog
        issue={editingIssue}
        open={rectificationOpen}
        onOpenChange={(v) => { setRectificationOpen(v); if (!v) setEditingIssue(null); }}
        onSaved={handleRectificationSaved}
      />
    </PageShell>
  );
}

function SkeletonTab() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <Card>
        <CardContent className="h-32" />
      </Card>      <Card>
        <CardContent className="h-48" />
      </Card>
    </div>
  );
}
