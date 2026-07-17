'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { orderedFrozenModels } from '@/components/reports/frozen-report-reader';
import type { FrozenReportViewModel } from '@/lib/report-frozen-view';
import { Button } from '@/components/ui/button';
import { ReportPrintDocument } from '@/components/reports/report-section-block-renderer';
import { buildPrintReportViewModel, type PrintIssueProjectionInput } from '@/lib/server/report-print-renderer';

type SiblingReport = { id: string };
type SharePayload = {
  frozenViewModel: FrozenReportViewModel;
  siblingReports?: SiblingReport[];
  siblingFrozenViewModels?: Record<string, FrozenReportViewModel>;
  mergedReportOrder?: string[];
  liveIssues?: PrintIssueProjectionInput[];
  siblingIssuesMap?: Record<string, PrintIssueProjectionInput[]>;
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
    sharePayload.mergedReportOrder,
  );
  const primary = sharePayload.frozenViewModel;
  const printModels = models.map((model) => buildPrintReportViewModel(
    model,
    model.header.id === primary.header.id
      ? sharePayload.liveIssues ?? []
      : sharePayload.siblingIssuesMap?.[model.header.id] ?? [],
  ));
  const handleDownloadReport = async () => {
    const pendingImages = Array.from(document.images).filter((image) => !image.complete);
    await Promise.all(pendingImages.map((image) => new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 5000);
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    })));
    await document.fonts?.ready;
    window.print();
  };

  const shareDate = new Date().toLocaleDateString('zh-CN');
  return (
    <main data-testid="share-print-report-view" className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1180px] rounded-xl bg-white shadow-sm sm:rounded-2xl">
        <header data-testid="share-readonly-header" className="flex flex-col gap-3 border-b border-slate-300 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">产品体验管理平台 · 匿名只读分享</p>
            <h1 className="mt-1 break-words text-lg font-semibold text-foreground sm:text-xl">{primary.header.title}</h1>
          </div>
          {primary.capabilities.canExport && <Button data-testid="share-download-button" size="sm" className="print:hidden shrink-0" onClick={() => void handleDownloadReport()}><Download className="mr-1 h-4 w-4" />下载报告</Button>}
        </header>
        <div className="px-4 py-5 sm:px-6 sm:py-7">
          {printModels.map((model) => (
            <section key={model.sourceReportId} data-testid={`share-report-${model.sourceReportId}`} className="border-b border-slate-200 py-2 last:border-b-0">
              <ReportPrintDocument model={model} interactiveMedia />
            </section>
          ))}
        </div>
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">产品体验管理平台 · 分享报告（仅查看） · {shareDate}</footer>
      </div>
    </main>
  );
}
