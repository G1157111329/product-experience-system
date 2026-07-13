'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { ImagePreview } from '@/components/image-preview';
import {
  isAllowedMediaSource,
  isPendingMediaUrl,
  isUnavailableMediaUrl,
  pendingMediaDataUrl,
} from '@/lib/use-presigned-url';
import { cn } from '@/lib/utils';
import type { ReportMediaItem, ReportMediaRole } from './report-media-grid';

interface ReportMediaPreviewProps {
  item?: ReportMediaItem;
  role?: ReportMediaRole;
  filePath?: string;
  type?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  resolvedUrl?: string;
}

function storageKey(value: string) {
  if (!value || /^(https?:|blob:|data:)/i.test(value) || value.startsWith('/api/materials/file/')) return null;
  return value.replace(/^\/uploads\//, '').replace(/^\/+/, '');
}

function isVideo(value: string) {
  return value.toLowerCase().includes('video') || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(value);
}

export function ReportMediaPreview({
  item,
  role = 'evidence',
  filePath = '',
  type = 'image',
  name = '',
  resolvedUrl: resolvedUrlProp,
}: ReportMediaPreviewProps) {
  const media = item ?? {
    id: filePath || name || 'report-media',
    url: filePath,
    type,
    name: name || '素材',
  };
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!media.url) return null;

  const resolvedUrl = resolvedUrlProp
    ?? (isAllowedMediaSource(media.url) ? media.url : pendingMediaDataUrl);
  const pending = isPendingMediaUrl(resolvedUrl);
  const unavailable = isUnavailableMediaUrl(resolvedUrl);
  const video = isVideo(media.type) || isVideo(media.url);
  const key = storageKey(media.url);
  const derivativeUrl = key
    ? `/api/materials/${video ? 'poster' : 'thumb'}/${key}`
    : null;
  const derivativeFailed = derivativeUrl !== null && failedSource === derivativeUrl;
  const thumbnailUrl = derivativeUrl && !derivativeFailed ? derivativeUrl : resolvedUrl;
  const mediaFailed = !video && failedSource === resolvedUrl;
  const canPreview = !pending && !unavailable && !mediaFailed;
  const aspect = video ? '16/9' : '4/3';

  return (
    <>
      <button
        type="button"
        data-testid="report-media-item"
        data-media-role={role}
        data-media-type={video ? 'video' : 'image'}
        data-aspect={aspect}
        aria-label={canPreview ? `${video ? '播放视频' : '查看原图'}：${media.name}` : undefined}
        disabled={!canPreview}
        onClick={() => canPreview && setPreviewUrl(resolvedUrl)}
        className={cn(
          'group relative block min-w-0 w-full overflow-hidden rounded-lg border bg-muted/30 text-left disabled:cursor-default',
          video ? 'aspect-video' : 'aspect-[4/3]',
        )}
      >
        {pending || unavailable || mediaFailed ? (
          <div data-testid="report-media-placeholder" className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
            {unavailable || mediaFailed ? '素材不可用' : '加载中'}
          </div>
        ) : video ? (
          <>
            {derivativeUrl && !derivativeFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={derivativeUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => setFailedSource(derivativeUrl)}
              />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="h-7 w-7 fill-white text-white" aria-hidden="true" />
            </span>
            {media.duration && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{media.duration}</span>}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={media.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            loading="lazy"
            onError={() => setFailedSource(thumbnailUrl)}
          />
        )}
      </button>
      <ImagePreview url={previewUrl} mediaType={media.type} onClose={() => setPreviewUrl(null)} />
    </>
  );
}
