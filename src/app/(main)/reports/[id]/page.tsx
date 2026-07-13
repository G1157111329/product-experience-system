'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/app';
import { FrozenReportReader } from '@/components/reports/frozen-report-reader';
import type { FrozenReportViewModel } from '@/lib/report-frozen-view';
import { ReportStickyHeader } from './components/report-sticky-header';

export default function ReportDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const legacy = searchParams.get('v') === '3' || searchParams.get('legacy') === '1';
  const [frozenViewModel, setFrozenViewModel] = useState<FrozenReportViewModel | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (legacy) { window.location.href = `/reports/legacy/${id}`; return; }
    const controller = new AbortController();
    setFrozenViewModel(null);
    setError('');
    void fetch(`/api/reports/${id}/detail`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload.code !== 0 || !payload.data?.frozenViewModel) throw new Error(payload.message || '报告加载失败');
        setFrozenViewModel(payload.data.frozenViewModel as FrozenReportViewModel);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '报告加载失败');
      });
    return () => controller.abort();
  }, [id, legacy]);

  if (legacy || (!frozenViewModel && !error)) return <LoadingState />;
  if (!frozenViewModel) return <PageShell className="p-6"><p className="text-muted-foreground">{error}</p></PageShell>;

  const model = frozenViewModel;
  return (
    <PageShell size="wide" className="space-y-0" data-testid="report-frozen-detail">
      <ReportStickyHeader
        id={model.header.id}
        title={model.header.title}
        productModel={model.header.productModel}
        status={model.header.status}
        reportType={model.header.reportType}
        projectPhase={null}
        taskTitle={null}
        aiSummary={model.summary.aiSummary}
        onExport={() => window.open(`/reports/print?id=${id}&mode=fast`, '_blank')}
      />
      <FrozenReportReader model={model} />
      {model.capabilities.canManageIssues && (
        <div className="border-t p-4 text-right">
          <Button variant="outline" onClick={() => { window.location.href = '/issues'; }}>管理问题</Button>
        </div>
      )}
    </PageShell>
  );
}

function LoadingState() {
  return <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2">正在加载冻结报告...</p></div>;
}
