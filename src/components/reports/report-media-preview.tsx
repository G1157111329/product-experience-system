'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { ImagePreview } from '@/components/image-preview';
import {
  buildMediaDerivativeUrl,
  isAllowedMediaSource,
  isPendingMediaUrl,
  isUnavailableMediaUrl,
  pendingMediaDataUrl,
  toPlayableVideoSrc,
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
  const playableVideoUrl = video ? toPlayableVideoSrc(resolvedUrl) : undefined;
  const derivativeUrl = buildMediaDerivativeUrl(resolvedUrl, video ? 'poster' : 'thumb');
  const derivativeFailed = derivativeUrl !== null && failedSource === derivativeUrl;
  const thumbnailUrl = derivativeUrl && !derivativeFailed ? derivativeUrl : resolvedUrl;
  const mediaFailed = !video && failedSource === resolvedUrl;
  const canPreview = !pending && !unavailable && !mediaFailed;
  const aspect = '4/3';
  const compactVideoLabel = role === 'matrix' || role === 'share-paper-compact';

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
          'aspect-[4/3]',
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
              <video
                src={playableVideoUrl ? `${playableVideoUrl}#t=0.1` : undefined}
                className="h-full w-full object-cover"
                preload="metadata"
                muted
                playsInline
                aria-hidden="true"
                onError={() => setFailedSource(resolvedUrl)}
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="h-7 w-7 fill-white text-white" aria-hidden="true" />
            </span>
            <span data-testid="report-media-video-label" className={cn('absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center font-bold tracking-wide text-white', compactVideoLabel ? 'text-[6px]' : 'text-[8px]')}>VIDEO</span>
            {media.duration && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{media.duration}</span>}
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
