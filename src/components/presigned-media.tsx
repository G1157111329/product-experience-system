'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ImageOff, VideoOff } from 'lucide-react';
import { usePresignedUrl } from '@/lib/use-presigned-url';
import { cn } from '@/lib/utils';

interface PresignedImageProps {
  filePath: string | null | undefined;
  alt: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

function MediaFallback({
  type,
  className,
  style,
  onClick,
}: {
  type: 'image' | 'video';
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const Icon = type === 'video' ? VideoOff : ImageOff;
  return (
    <div
      className={cn('flex min-h-24 min-w-24 flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-muted p-3 text-center text-xs text-muted-foreground', className)}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={type === 'video' ? '视频素材加载失败' : '图片素材加载失败'}
    >
      <Icon className="h-5 w-5" />
      <span>素材加载失败</span>
    </div>
  );
}

export function PresignedImage({
  filePath,
  alt,
  className,
  style,
  onClick,
  loading = 'lazy',
  fetchPriority,
}: PresignedImageProps) {
  const signedUrl = usePresignedUrl(filePath);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [signedUrl, filePath]);

  if (!filePath) return null;
  if (loadFailed) return <MediaFallback type="image" className={className} style={style} onClick={onClick} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signedUrl || undefined}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      loading={loading}
      fetchPriority={fetchPriority}
      onError={() => setLoadFailed(true)}
    />
  );
}

interface PresignedVideoProps {
  filePath: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  preload?: 'none' | 'metadata' | 'auto';
  muted?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  playsInline?: boolean;
}

export function PresignedVideo({
  filePath,
  className,
  style,
  preload = 'metadata',
  muted,
  autoPlay,
  loop,
  playsInline,
}: PresignedVideoProps) {
  const signedUrl = usePresignedUrl(filePath);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [signedUrl, filePath]);

  if (!filePath) return null;
  if (loadFailed) return <MediaFallback type="video" className={className} style={style} />;

  return (
    <video
      src={signedUrl || undefined}
      className={className}
      style={style}
      preload={preload}
      muted={muted}
      autoPlay={autoPlay}
      loop={loop}
      playsInline={playsInline}
      onError={() => setLoadFailed(true)}
    />
  );
}
