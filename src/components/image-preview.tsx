'use client';

import { useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ImagePreviewProps {
  url: string | null;
  onClose: () => void;
}

export function ImagePreview({ url, onClose }: ImagePreviewProps) {
  const [zoomed, setZoomed] = useState(false);

  if (!url) return null;

  return (
    <Dialog open={!!url} onOpenChange={(open) => { if (!open) { setZoomed(false); onClose(); } }}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden border-0 bg-black/90 flex items-center justify-center">
        <div
          className="relative w-full h-full flex items-center justify-center cursor-pointer"
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
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed); }}
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
            </button>
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

export function useImagePreview() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const open = useCallback((url: string) => setPreviewUrl(url), []);
  const close = useCallback(() => setPreviewUrl(null), []);

  return { previewUrl, open, close, PreviewComponent: () => <ImagePreview url={previewUrl} onClose={close} /> };
}
