'use client';

import { usePresignedUrl } from '@/lib/use-presigned-url';

interface PresignedImageProps {
  filePath: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

/**
 * 图片组件：自动处理 file_path -> 签名URL 的转换
 * 兼容旧数据（file_url 以 http 开头）和新数据（file_path 相对路径）
 */
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

  if (!filePath) return null;

  return (
    <img
      src={signedUrl || undefined}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );
}

/**
 * 视频组件：自动处理 file_path -> 签名URL 的转换
 */
interface PresignedVideoProps {
  filePath: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
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

  if (!filePath) return null;

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
    />
  );
}
