'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { FrozenReportReader, orderedFrozenModels } from '@/components/reports/frozen-report-reader';
import type { FrozenReportViewModel } from '@/lib/report-frozen-view';
import { Button } from '@/components/ui/button';
import { FrozenReportHeaderMeta } from '@/components/reports/frozen-report-header-meta';

type SiblingReport = { id: string };
type SharePayload = {
  frozenViewModel: FrozenReportViewModel;
  siblingReports?: SiblingReport[];
  siblingFrozenViewModels?: Record<string, FrozenReportViewModel>;
};

export default function ShareReportPage() {
  const { token } = useParams<{ token: string }>();
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setSharePayload(null);
    setError('');
    void fetch(`/api/reports/share?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload.code !== 0 || !payload.data?.frozenViewModel) throw new Error(payload.message || '分享报告加载失败');
        setSharePayload(payload.data as SharePayload);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '分享报告加载失败');
      });
    return () => controller.abort();
  }, [token]);

  if (!sharePayload && !error) {
    return <div className="p-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2">正在加载分享报告...</p></div>;
  }
  if (!sharePayload) {
    return <div className="p-10 text-center text-sm text-muted-foreground"><AlertCircle className="mx-auto h-6 w-6" /><p className="mt-2">{error}</p></div>;
  }

  const models = orderedFrozenModels(
    sharePayload.frozenViewModel,
    sharePayload.siblingReports,
    sharePayload.siblingFrozenViewModels,
  );
  const primary = sharePayload.frozenViewModel;
  const handleExportPDF = () => {
    if (primary.header.reportType === 'comparison_report') {
      window.open(`/api/reports/${primary.header.id}/pdf?share_token=${encodeURIComponent(token)}`, '_blank');
    } else {
      window.open(`/reports/print?id=${encodeURIComponent(primary.header.id)}&mode=fast&share_token=${encodeURIComponent(token)}`, '_blank');
    }
  };

  return (
    <main data-testid="share-frozen-report-view" className="mx-auto min-h-screen max-w-7xl bg-background">
      <header className="border-b px-4 py-5 sm:px-6">
        <p className="text-xs font-medium text-muted-foreground">产品体验管理平台 · 匿名只读分享</p>
        <div className="flex items-start justify-between gap-4">
          <FrozenReportHeaderMeta title={primary.header.title} productModel={primary.header.productModel} taskInfo={primary.summary.taskInfo} />
          {primary.capabilities.canExport && <Button size="sm" onClick={handleExportPDF}><Download className="mr-1 h-4 w-4" />导出PDF</Button>}
        </div>
      </header>
      {models.map((model) => (
        <section key={model.header.id} data-testid={`share-report-${model.header.id}`} className="border-b last:border-b-0">
          {models.length > 1 && <h2 className="px-4 pt-5 text-lg font-semibold sm:px-6">{model.header.title}</h2>}
          <FrozenReportReader model={model} />
        </section>
      ))}
      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">产品体验管理平台 - 分享报告（仅查看）</footer>
    </main>
  );
}
