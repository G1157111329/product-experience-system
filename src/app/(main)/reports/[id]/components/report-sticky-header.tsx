'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Share2, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportShareDialog } from '@/components/reports/report-share-dialog';

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
  onExport?: () => void;
}

export function ReportStickyHeader({
  id,
  title,
  productModel,
  projectPhase,
  projectType,
  aiSummary,
  onExport,
}: ReportStickyHeaderProps) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);

  // 从 AI 总结提取评分（关键要词是句段非词语，不符合≤4字要求，不显示）
  const score = aiSummary?.satisfaction_score != null ? String(aiSummary.satisfaction_score) : (aiSummary?.score != null ? String(aiSummary.score) : '');

  return (
    <>
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{title || '报告详情'}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {productModel && <span className="font-medium">{productModel}</span>}
            {projectType && <Badge variant="outline" className="text-[10px]">{projectType}</Badge>}
            {projectPhase && <Badge variant="secondary" className="text-[10px]">{projectPhase}</Badge>}
            {score && (
              <Badge className="text-[10px] gap-0.5">
                <Star className="h-2.5 w-2.5" />{score}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShareOpen(true)} aria-label="分享报告">
            <Share2 className="h-4 w-4" />
          </Button>
          {onExport && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExport}>
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
