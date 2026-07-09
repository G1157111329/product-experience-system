'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Share2, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';

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

  // 从 AI 总结提取评分（关键要词是句段非词语，不符合≤4字要求，不显示）
  const score = aiSummary?.satisfaction_score != null ? String(aiSummary.satisfaction_score) : (aiSummary?.score != null ? String(aiSummary.score) : '');

  const handleShare = async () => {
    // 创建分享链接并复制
    try {
      const res = await fetch(`/api/reports/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: id, expires_in: 'permanent' }),
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.share_token) {
        const shareUrl = `${window.location.origin}/reports/share/${data.data.share_token}`;
        copyToClipboard(shareUrl);
        toast.success('分享链接已复制');
      } else {
        // 回退：复制当前报告链接
        copyToClipboard(`${window.location.origin}/reports/${id}`);
        toast.success('链接已复制');
      }
    } catch {
      copyToClipboard(`${window.location.origin}/reports/${id}`);
      toast.success('链接已复制');
    }
  };

  return (
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare}>
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
  );
}
