'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { FrozenReportReader } from '@/components/reports/frozen-report-reader';
import type { FrozenReportViewModel } from '@/lib/report-frozen-view';

export default function ShareReportPage() {
  const { token } = useParams<{ token: string }>();
  const [frozenViewModel, setFrozenViewModel] = useState<FrozenReportViewModel | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setFrozenViewModel(null);
    setError('');
    void fetch(`/api/reports/share?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload.code !== 0 || !payload.data?.frozenViewModel) throw new Error(payload.message || '分享报告加载失败');
        setFrozenViewModel(payload.data.frozenViewModel as FrozenReportViewModel);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '分享报告加载失败');
      });
    return () => controller.abort();
  }, [token]);

  if (!frozenViewModel && !error) {
    return <div className="p-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2">正在加载分享报告...</p></div>;
  }
  if (!frozenViewModel) {
    return <div className="p-10 text-center text-sm text-muted-foreground"><AlertCircle className="mx-auto h-6 w-6" /><p className="mt-2">{error}</p></div>;
  }

  return (
    <main data-testid="share-frozen-report-view" className="mx-auto min-h-screen max-w-7xl bg-background">
      <header className="border-b px-4 py-5 sm:px-6">
        <p className="text-xs font-medium text-muted-foreground">产品体验管理平台 · 匿名只读分享</p>
        <h1 className="mt-1 text-xl font-semibold">{frozenViewModel.header.title}</h1>
        {frozenViewModel.header.productModel && <p className="mt-1 text-sm text-muted-foreground">{frozenViewModel.header.productModel}</p>}
      </header>
      <FrozenReportReader model={frozenViewModel} />
      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">产品体验管理平台 - 分享报告（仅查看）</footer>
    </main>
  );
}
