'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useCallback, useEffect, type KeyboardEvent } from 'react';
import { X, ZoomIn, ZoomOut, Play, ImageOff, VideoOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePresignedUrl } from '@/lib/use-presigned-url';

interface ImagePreviewProps {
  url: string | null;
  onClose: () => void;
}

export function ImagePreview({ url, onClose }: ImagePreviewProps) {
  const [zoomed, setZoomed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const presignedUrl = usePresignedUrl(url);
  const displayUrl = presignedUrl || url || undefined;

  useEffect(() => {
    setLoadFailed(false);
  }, [displayUrl]);

  if (!url) return null;

  const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || url.includes('/video/');

  return (
    <Dialog open={!!url} onOpenChange={(open) => { if (!open) { setZoomed(false); onClose(); } }}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden border-0 bg-black/90 flex items-center justify-center">
        <DialogHeader className="sr-only">
          <DialogTitle>预览</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center">
          {loadFailed ? (
            <MediaLoadError type={isVideo ? 'video' : 'image'} large />
          ) : isVideo ? (
            <video
              src={displayUrl}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] object-contain"
              style={{ borderRadius: '4px' }}
              onError={() => setLoadFailed(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center cursor-pointer"
              onClick={() => setZoomed(!zoomed)}
            >
              <img
                src={displayUrl}
                alt="预览"
                className={`transition-all duration-200 ease-out max-h-[90vh] ${
                  zoomed ? 'max-w-none w-auto h-auto scale-100 cursor-zoom-out' : 'max-w-full object-contain cursor-zoom-in'
                }`}
                style={zoomed ? { transform: 'scale(1)' } : {}}
                onError={() => setLoadFailed(true)}
              />
            </div>
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            {!isVideo && !loadFailed && (
              <button
                aria-label={zoomed ? '缩小预览' : '放大预览'}
                className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed); }}
              >
                {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              </button>
            )}
            <button
              aria-label="关闭预览"
              className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              onClick={(e) => { e.stopPropagation(); setZoomed(false); onClose(); }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaLoadError({ type, large = false }: { type: 'image' | 'video'; large?: boolean }) {
  const Icon = type === 'video' ? VideoOff : ImageOff;
  return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground ${large ? 'min-h-72 min-w-72 rounded-lg p-8' : 'h-full w-full p-2'}`}>
      <Icon className={large ? 'h-8 w-8' : 'h-5 w-5'} />
      <span className={large ? 'text-sm font-medium' : 'text-[11px] leading-tight'}>素材加载失败</span>
      {large && <span className="text-xs">请检查文件是否存在、格式是否支持，或重新上传素材。</span>}
    </div>
  );
}

/** Renders a thumbnail that plays video on click, or opens image preview. */
export function MediaThumbnail({ url, type, onClick, size = 'md', responsive }: {
  url: string; type: 'image' | 'video'; onClick?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg'; responsive?: boolean;
}) {
  const sizeMap = { xs: 'w-8 h-8', sm: 'w-12 h-12', md: 'w-20 h-20', lg: 'w-28 h-28' };
  const responsiveClass = 'w-full aspect-square min-w-0';
  const sizeClass = responsive ? responsiveClass : sizeMap[size];
  const isVideo = type === 'video';
  const presignedSrc = usePresignedUrl(url);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [presignedSrc, url]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      className={`relative ${sizeClass} rounded-lg overflow-hidden border border-border bg-muted cursor-pointer group ${responsive ? '' : 'shrink-0'}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={isVideo ? '查看视频素材' : '查看图片素材'}
    >
      {loadFailed ? (
        <MediaLoadError type={isVideo ? 'video' : 'image'} />
      ) : isVideo ? (
        <>
          <video src={presignedSrc || undefined} className="w-full h-full object-cover" muted preload="metadata" onError={() => setLoadFailed(true)} />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        </>
      ) : (
        <img src={presignedSrc || undefined} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setLoadFailed(true)} />
      )}
    </div>
  );
}

export function useImagePreview() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const open = useCallback((url: string) => setPreviewUrl(url), []);
  const close = useCallback(() => setPreviewUrl(null), []);

  return { previewUrl, open, close, PreviewComponent: () => <ImagePreview url={previewUrl} onClose={close} /> };
}
