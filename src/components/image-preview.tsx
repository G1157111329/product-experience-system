'use client';

import { useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ImagePreviewProps {
  url: string | null;
  onClose: () => void;
}

export function ImagePreview({ url, onClose }: ImagePreviewProps) {
  const [zoomed, setZoomed] = useState(false);

  if (!url) return null;

  const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || url.includes('/video/');

  return (
    <Dialog open={!!url} onOpenChange={(open) => { if (!open) { setZoomed(false); onClose(); } }}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden border-0 bg-black/90 flex items-center justify-center">
        <DialogHeader className="sr-only">
          <DialogTitle>预览</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center">
          {isVideo ? (
            <video
              src={url}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] object-contain"
              style={{ borderRadius: '4px' }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center cursor-pointer"
              onClick={() => setZoomed(!zoomed)}
            >
              <img
                src={url}
                alt="预览"
                className={`transition-all duration-200 ease-out max-h-[90vh] ${
                  zoomed ? 'max-w-none w-auto h-auto scale-100 cursor-zoom-out' : 'max-w-full object-contain cursor-zoom-in'
                }`}
                style={zoomed ? { transform: 'scale(1)' } : {}}
              />
            </div>
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            {!isVideo && (
              <button
                className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed); }}
              >
                {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              </button>
            )}
            <button
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

/** Renders a thumbnail that plays video on click, or opens image preview */
export function MediaThumbnail({ url, type, onClick, size = 'md' }: {
  url: string; type: 'image' | 'video'; onClick?: () => void; size?: 'sm' | 'md' | 'lg';
}) {
  const sizeMap = { sm: 'w-12 h-12', md: 'w-20 h-20', lg: 'w-28 h-28' };
  const isVideo = type === 'video';

  return (
    <div
      className={`relative ${sizeMap[size]} rounded-lg overflow-hidden border border-border bg-muted cursor-pointer group shrink-0`}
      onClick={onClick}
    >
      {isVideo ? (
        <>
          <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        </>
      ) : (
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
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
