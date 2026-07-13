'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  matrixType: 'multi_matrix' | 'single_waterfall' | 'data_matrix' | null;
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
  data_matrix: '数据矩阵',
  comparison_matrix: '对比矩阵',
  function_effect: '功能效果',
};

function isMatrixTab(key: string): boolean {
  return key === 'matrix' || key === 'data_matrix' || key === 'comparison_matrix';
}

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
  const headerRequestVersion = useRef(0);
  const { PreviewComponent } = useImagePreview();

  // V3 legacy redirect
  useEffect(() => {
    if (legacy) {
      window.location.href = `/reports/legacy/${id}`;
    }
  }, [legacy, id]);

  const fetchHeader = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++headerRequestVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/reports/${id}/header`, { signal });
      const data = await res.json();
      if (signal?.aborted || requestVersion !== headerRequestVersion.current) return;
      if (data.code === 0) {
        const nextHeader = data.data as HeaderData;
        setHeader(nextHeader);
        setActiveTab((current) => nextHeader.availableTabs.includes(current) ? current : 'summary');
      } else {
        setLoadError(data.message || '报告加载失败');
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      if (requestVersion !== headerRequestVersion.current) return;
      setLoadError('网络错误，请重试');
    } finally {
      if (!signal?.aborted && requestVersion === headerRequestVersion.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    headerRequestVersion.current += 1;
    setHeader(null);
    setActiveTab('summary');
    setSummary(null);
    setIssues(null);
    setMatrix(null);
    setFunctionEffect(null);
    setLoadError(null);
    setLoading(true);
    setRectificationOpen(false);
    setEditingIssue(null);

    const controller = new AbortController();
    void fetchHeader(controller.signal);
    return () => {
      controller.abort();
      headerRequestVersion.current += 1;
    };
  }, [id, fetchHeader]);

  useEffect(() => {
    if (!header || header.id !== id) return;

    let endpoint: string | null = null;
    let applyData: ((data: unknown) => void) | null = null;
    if (activeTab === 'summary' && !summary) {
      endpoint = 'summary';
      applyData = (data) => setSummary(data as SummaryData);
    } else if (activeTab === 'issues' && !issues) {
      endpoint = 'issues';
      applyData = (data) => setIssues((data || []) as IssueItem[]);
    } else if (isMatrixTab(activeTab) && !matrix) {
      endpoint = 'matrix';
      applyData = (data) => setMatrix(data as MatrixData);
    } else if (activeTab === 'function_effect' && !functionEffect) {
      endpoint = 'function-effect';
      applyData = (data) => setFunctionEffect(data as { recipes: Array<Record<string, unknown>> });
    }
    if (!endpoint || !applyData) return;

    const controller = new AbortController();
    const loadTab = async () => {
      try {
        const res = await fetch(`/api/reports/${id}/${endpoint}`, { signal: controller.signal });
        const data = await res.json();
        if (!controller.signal.aborted && data.code === 0) applyData(data.data);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      }
    };
    void loadTab();
    return () => controller.abort();
  }, [activeTab, functionEffect, header, id, issues, matrix, summary]);

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
    <PageShell size="wide" className="space-y-0" data-testid="report-frozen-detail">
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
        {isMatrixTab(activeTab) && (
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
