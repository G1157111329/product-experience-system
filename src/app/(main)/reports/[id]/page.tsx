'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageShell } from '@/components/app';
import { FrozenReportReader, orderedFrozenModels } from '@/components/reports/frozen-report-reader';
import { IssueRectificationDialog, type IssueForRectification } from '@/components/issues/issue-rectification-dialog';
import type { FrozenIssue, FrozenReportViewModel } from '@/lib/report-frozen-view';
import { fetchFrozenReportProjection } from '@/lib/report-frozen-refresh';
import { ReportStickyHeader } from './components/report-sticky-header';

type SiblingReport = { id: string };

export default function ReportDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const legacy = searchParams.get('v') === '3' || searchParams.get('legacy') === '1';
  const [frozenViewModel, setFrozenViewModel] = useState<FrozenReportViewModel | null>(null);
  const [siblingReports, setSiblingReports] = useState<SiblingReport[]>([]);
  const [siblingFrozenViewModels, setSiblingFrozenViewModels] = useState<Record<string, FrozenReportViewModel>>({});
  const [mergedReportOrder, setMergedReportOrder] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [rectificationIssue, setRectificationIssue] = useState<IssueForRectification | null>(null);

  useEffect(() => {
    if (legacy) { window.location.href = `/reports/legacy/${id}`; return; }
    const controller = new AbortController();
    setFrozenViewModel(null);
    setSiblingReports([]);
    setSiblingFrozenViewModels({});
    setMergedReportOrder([]);
    setError('');
    void fetch(`/api/reports/${id}/detail`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload.code !== 0 || !payload.data?.frozenViewModel) throw new Error(payload.message || '报告加载失败');
        setFrozenViewModel(payload.data.frozenViewModel as FrozenReportViewModel);
        setSiblingReports((payload.data.siblingReports || []) as SiblingReport[]);
        setSiblingFrozenViewModels((payload.data.siblingFrozenViewModels || {}) as Record<string, FrozenReportViewModel>);
        setMergedReportOrder((payload.data.mergedReportOrder || []) as string[]);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '报告加载失败');
      });
    return () => controller.abort();
  }, [id, legacy]);

  const openIssueRectification = async (issue: FrozenIssue) => {
    if (!issue.liveIssueId) return;
    const response = await fetch(`/api/issues/${issue.liveIssueId}`);
    const payload = await response.json();
    if (payload.code === 0 && payload.data) setRectificationIssue(payload.data as IssueForRectification);
  };

  const refreshFrozenProjection = async () => {
    try {
      const refreshed = await fetchFrozenReportProjection(id);
      setFrozenViewModel(refreshed.frozenViewModel);
      setSiblingReports(refreshed.siblingReports);
      setSiblingFrozenViewModels(refreshed.siblingFrozenViewModels);
      setMergedReportOrder(refreshed.mergedReportOrder);
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : '报告问题状态刷新失败');
    }
  };
  if (legacy || (!frozenViewModel && !error)) return <LoadingState />;
  if (!frozenViewModel) return <PageShell className="p-6"><p className="text-muted-foreground">{error}</p></PageShell>;

  const model = frozenViewModel;
  const models = orderedFrozenModels(model, siblingReports, siblingFrozenViewModels, mergedReportOrder);
  return (
    <PageShell size="wide" className="space-y-0" data-testid="report-frozen-detail">
      {models.map((member) => (
        <section key={member.header.id} className="border-b last:border-b-0">
          <ReportStickyHeader
            id={member.header.id}
            title={member.header.title}
            productModel={member.header.productModel}
            status={member.header.status}
            reportType={member.header.reportType}
            projectPhase={null}
            taskTitle={null}
            aiSummary={member.summary.aiSummary}
            taskInfo={member.summary.taskInfo}
            onExport={() => window.open(`/reports/print?id=${member.header.id}&mode=fast`, '_blank')}
          />
          <FrozenReportReader
            model={member}
            onManageIssue={member.capabilities.canManageIssues ? (issue) => { void openIssueRectification(issue); } : undefined}
          />
        </section>
      ))}
      <IssueRectificationDialog
        issue={rectificationIssue}
        open={Boolean(rectificationIssue)}
        onOpenChange={(open) => { if (!open) setRectificationIssue(null); }}
        onSaved={() => { void refreshFrozenProjection(); }}
      />
    </PageShell>
  );
}

function LoadingState() {
  return <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2">正在加载冻结报告...</p></div>;
}
