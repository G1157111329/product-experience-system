'use client';

import { useState } from 'react';
import { Copy, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

type ShareDuration = '7d' | '30d' | 'permanent';

export function ReportShareDialog({
  reportId,
  reportTitle,
  open,
  onOpenChange,
}: {
  reportId: string;
  reportTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [duration, setDuration] = useState<ShareDuration>('30d');
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const options: Array<{ value: ShareDuration; label: string }> = [
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' },
    { value: 'permanent', label: '永久' },
  ];

  const createShare = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/reports/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId, duration }),
      });
      const json = await response.json();
      if (json.code !== 0 || !json.data?.share_token) {
        throw new Error(json.message || '分享链接创建失败');
      }
      const url = `${window.location.origin}/reports/share/${json.data.share_token}`;
      setShareUrl(url);
      try {
        await copyToClipboard(url);
        toast.success('分享链接已生成并复制');
      } catch {
        toast.warning('分享链接已生成，请点击右侧复制按钮');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '分享链接创建失败');
    } finally {
      setCreating(false);
    }
  };

  const copyShareUrl = async () => {
    try {
      await copyToClipboard(shareUrl);
      toast.success('分享链接已复制');
    } catch {
      toast.error('浏览器未授予剪贴板权限，请手动复制链接');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setShareUrl('');
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享报告</DialogTitle>
          <DialogDescription>{reportTitle || '选择链接有效期后生成公开只读链接。'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                duration === option.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
              onClick={() => setDuration(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button onClick={() => void createShare()} disabled={creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
          生成分享链接
        </Button>
        {shareUrl && (
          <div className="flex items-center gap-2 rounded-md bg-muted p-2">
            <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{shareUrl}</span>
            <Button variant="ghost" size="icon" onClick={() => void copyShareUrl()} aria-label="复制分享链接">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
