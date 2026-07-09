'use client';

import { useState } from 'react';
import { ImagePreview, MediaThumbnail } from '@/components/image-preview';

interface ReportMediaPreviewProps {
  filePath: string;
  type?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function ReportMediaPreview({
  filePath,
  type = 'image',
  name,
  size = 'sm',
}: ReportMediaPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  if (!filePath) return null;

  return (
    <>
      <div title={name || (type === 'video' ? '播放视频' : '查看原图')}>
        <MediaThumbnail
          url={filePath}
          type={type === 'video' ? 'video' : 'image'}
          size={size}
          onClick={() => setPreviewUrl(filePath)}
        />
      </div>
      <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
  );
}
