'use client';

/**
 * MatrixMaterialStagingRail — task-scoped staging + unassigned pools (PRD §9.2).
 */
import { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaThumbnail } from '@/components/image-preview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StagingItem {
  id: string;
  materialType: string;
  fileName: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
}

interface MatrixMaterialStagingRailProps {
  taskId: string;
  className?: string;
  onDragMaterial?: (materialId: string) => void;
}

type PoolTab = 'staging' | 'unassigned';

export function MatrixMaterialStagingRail({
  taskId,
  className,
  onDragMaterial,
}: MatrixMaterialStagingRailProps) {
  const [tab, setTab] = useState<PoolTab>('staging');
  const [items, setItems] = useState<StagingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        tab === 'staging'
          ? `/api/v1/materials/staging?taskId=${encodeURIComponent(taskId)}`
          : '/api/v1/materials/unassigned';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0) {
        setItems(Array.isArray(json.data?.items) ? json.data.items : []);
      } else {
        toast.error(json.message || '加载素材池失败');
      }
    } catch {
      toast.error('加载素材池失败');
    } finally {
      setLoading(false);
    }
  }, [taskId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={cn('rounded-lg border bg-card flex flex-col min-h-0', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Inbox className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">素材池</span>
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void load()}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="flex gap-1 px-2 pt-2">
        <Button
          type="button"
          size="sm"
          variant={tab === 'staging' ? 'default' : 'ghost'}
          className="h-7 text-[11px] flex-1"
          onClick={() => setTab('staging')}
        >
          暂存
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'unassigned' ? 'default' : 'ghost'}
          className="h-7 text-[11px] flex-1"
          onClick={() => setTab('unassigned')}
        >
          待归属
        </Button>
      </div>
      <ScrollArea className="flex-1 max-h-48 lg:max-h-[min(40vh,320px)]">
        <div className="p-2 grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-3 gap-1.5">
          {loading && items.length === 0 ? (
            <p className="col-span-full text-xs text-muted-foreground py-6 text-center">加载中…</p>
          ) : items.length === 0 ? (
            <p className="col-span-full text-xs text-muted-foreground py-6 text-center px-2">
              {tab === 'staging'
                ? '暂无待归属素材。上传到任务后会出现在此，可拖到矩阵 D/O 槽。'
                : '待归属池为空。'}
            </p>
          ) : (
            items.map((m) => (
              <button
                key={m.id}
                type="button"
                draggable
                title={m.fileName || m.id}
                className="relative aspect-square rounded border overflow-hidden bg-muted/40 hover:ring-2 hover:ring-primary/40 cursor-grab active:cursor-grabbing"
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-material-id', m.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  onDragMaterial?.(m.id);
                }}
              >
                {m.fileUrl || m.thumbnailUrl ? (
                  <MediaThumbnail
                    url={m.fileUrl || m.thumbnailUrl || ''}
                    type={m.materialType === 'video' ? 'video' : 'image'}
                    size="xs"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
