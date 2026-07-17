'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Share2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportShareDialog } from '@/components/reports/report-share-dialog';
import { FrozenReportHeaderMeta } from '@/components/reports/frozen-report-header-meta';

interface ReportStickyHeaderProps {
  id: string;
  title: string;
  productModel: string | null;
  status: string;
  reportType: string | null;
  projectPhase: string | null;
  projectType?: string | null;
  taskTitle: string | null;
  aiSummary?: Record<string, unknown> | null;
  taskInfo?: Record<string, unknown> | null;
  onExport?: () => void;
}

export function ReportStickyHeader({
  id,
  title,
  productModel,
  taskInfo,
  onExport,
}: ReportStickyHeaderProps) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);

  // 从 AI 总结提取评分（关键要词是句段非词语，不符合≤4字要求，不显示）
  return (
    <>
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" onClick={() => router.back()} aria-label="返回报告列表">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <FrozenReportHeaderMeta title={title} productModel={productModel} taskInfo={taskInfo} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => setShareOpen(true)} aria-label="分享报告">
            <Share2 className="h-4 w-4" />
          </Button>
          {onExport && (
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={onExport} aria-label="下载报告">
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
    <ReportShareDialog reportId={id} reportTitle={title} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
