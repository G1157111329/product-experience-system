'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ReportPrintDocument } from '@/components/reports/report-section-block-renderer';
import { reportFilenameBase } from '@/lib/report-filename';
import type { FrozenReportViewModel } from '@/lib/report-frozen-view';
import { mapWithConcurrency, normalizePrintMode, posterStorageKey, signedPosterUrl, uniqueUrls, type PrintMode } from '@/lib/print-assets';
import { resolvePresignBatches } from '@/lib/presign-batches';
import {
  buildPrintReportViewModel,
  printReportMedia,
  type PrintMedia,
  type PrintReportViewModel,
} from '@/lib/server/report-print-renderer';
import { isAllowedMediaSource } from '@/lib/use-presigned-url';

type SharePayload = {
  frozenViewModel?: FrozenReportViewModel;
  siblingReports?: Array<{ id?: string }>;
  siblingFrozenViewModels?: Record<string, FrozenReportViewModel>;
};

function orderedShareModels(payload: SharePayload): FrozenReportViewModel[] {
  if (!payload.frozenViewModel) return [];
  const siblings = payload.siblingFrozenViewModels ?? {};
  const order = payload.siblingReports?.map((item) => String(item.id || '')).filter(Boolean) ?? [];
  return [
    payload.frozenViewModel,
    ...order.flatMap((id) => siblings[id] ? [siblings[id]] : []),
  ];
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToPrintableDataUrl(url: string, mode: PrintMode): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    const blob = await response.blob();
    if (mode === 'high') return blobToDataUrl(blob);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const value = new Image();
        value.onload = () => resolve(value);
        value.onerror = reject;
        value.src = objectUrl;
      });
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return blobToDataUrl(blob);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const printable = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
      return printable ? blobToDataUrl(printable) : blobToDataUrl(blob);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return url;
  }
}

async function presignPaths(paths: string[], reportId: string, shareToken: string | null) {
  const entries = uniqueUrls(paths).flatMap((path) => {
    const posterKey = posterStorageKey(path);
    if (posterKey) return [{ path, key: posterKey, poster: true }];
    if (isAllowedMediaSource(path) || /^https?:\/\//i.test(path)) return [];
    return [{ path, key: path, poster: false }];
  });
  const objectKeys = uniqueUrls(entries.map((entry) => entry.key));
  if (objectKeys.length === 0) return {};
  const signedByKey = await resolvePresignBatches(objectKeys, async (batch) => {
    try {
      const response = await fetch('/api/materials/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: batch, report_id: reportId, share_token: shareToken || undefined }),
      });
      if (!response.ok) return {};
      const payload = await response.json() as { code?: number; data?: Record<string, string> };
      return payload.code === 0 && payload.data ? payload.data : {};
    } catch {
      return {};
    }
  });
  return Object.fromEntries(entries.map((entry) => {
    const signed = signedByKey[entry.key];
    return [entry.path, signed ? (entry.poster ? signedPosterUrl(entry.path, signed) : signed) : entry.path];
  }));
}

async function preparePrintModel(model: FrozenReportViewModel, mode: PrintMode, shareToken: string | null) {
  const projected = buildPrintReportViewModel(model);
  const media = printReportMedia(projected);
  const printableMedia: Array<{ item: PrintMedia; field: 'url' | 'posterUrl'; url: string }> = [];
  for (const item of media) {
    if (item.type.toLowerCase().includes('video')) {
      if (item.posterUrl) printableMedia.push({ item, field: 'posterUrl', url: item.posterUrl });
    } else {
      printableMedia.push({ item, field: 'url', url: item.url });
    }
  }
  const sourceUrls = uniqueUrls(printableMedia.map((entry) => entry.url));
  const signed = await presignPaths(sourceUrls, projected.sourceReportId, shareToken);
  for (const entry of printableMedia) entry.item[entry.field] = signed[entry.url] ?? entry.url;

  if (mode !== 'text') {
    const printableUrls = uniqueUrls(printableMedia.map((entry) => entry.item[entry.field] || ''));
    const converted = await mapWithConcurrency(printableUrls, 4, async (url) => imageUrlToPrintableDataUrl(url, mode));
    const convertedByUrl = new Map(printableUrls.map((url, index) => [url, converted[index]]));
    for (const entry of printableMedia) {
      const current = entry.item[entry.field] || '';
      entry.item[entry.field] = convertedByUrl.get(current) ?? current;
    }
  }
  return projected;
}

export default function ReportPrintPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ReportPrintContent />
    </Suspense>
  );
}

function LoadingState({ message = '正在准备打印报告…' }: { message?: string }) {
  return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-2">{message}</p></div></div>;
}

function ReportPrintContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');
  const shareToken = searchParams.get('share_token');
  const printMode = normalizePrintMode(searchParams.get('mode'));
  const [models, setModels] = useState<PrintReportViewModel[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reportId) {
      setError('缺少报告 ID');
      return;
    }
    const controller = new AbortController();
    setModels([]);
    setError('');
    const endpoint = shareToken
      ? `/api/reports/share?token=${encodeURIComponent(shareToken)}`
      : `/api/reports/${encodeURIComponent(reportId)}/detail`;
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.code !== 0) throw new Error(payload.message || '报告加载失败');
        const frozenModels = shareToken
          ? orderedShareModels(payload.data as SharePayload)
          : payload.data?.frozenViewModel ? [payload.data.frozenViewModel as FrozenReportViewModel] : [];
        if (frozenModels.length === 0 || frozenModels[0]?.header.id !== reportId) throw new Error('冻结报告不存在或与请求不匹配');
        return Promise.all(frozenModels.map((model) => preparePrintModel(model, printMode, shareToken)));
      })
      .then((prepared) => {
        if (controller.signal.aborted) return;
        setModels(prepared);
        document.title = reportFilenameBase(prepared[0]?.header.title || '报告');
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '报告加载失败');
      });
    return () => controller.abort();
  }, [printMode, reportId, shareToken]);

  useEffect(() => {
    if (models.length === 0) return;
    let cancelled = false;
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(firstFrame); };
  }, [models]);

  if (error) return <div className="p-10 text-center text-sm text-red-700">{error}</div>;
  if (models.length === 0) return <LoadingState />;
  return (
    <main data-testid="print-report-ready" data-print-mode={printMode} className={printMode === 'text' ? 'print-text-mode bg-white p-5' : 'bg-white p-5'}>
      {models.map((model) => <ReportPrintDocument key={model.sourceReportId} model={model} />)}
      <style>{`@media print { body { margin: 0; background: #fff; } .print-text-mode img { display: none !important; } }`}</style>
    </main>
  );
}
