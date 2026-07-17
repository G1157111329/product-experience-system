'use client';

import { useMemo, type KeyboardEvent } from 'react';
import { useImagePreview } from '@/components/image-preview';
import {
  isAllowedMediaSource,
  isPendingMediaUrl,
  isUnavailableMediaUrl,
  pendingMediaDataUrl,
  toPlayableVideoSrc,
  unavailableMediaDataUrl,
  usePresignedUrls,
} from '@/lib/use-presigned-url';
import { cn } from '@/lib/utils';

interface Material {
  id: string;
  file_url: string;
  file_path?: string;
  file_name: string;
  material_type: string;
}

interface MediaGalleryProps {
  materials: Material[];
  size?: 'sm' | 'md' | 'lg';
  responsive?: boolean;
  columns?: { mobile: number; sm?: number; lg?: number };
  gap?: string;
  className?: string;
  onPreview?: (url: string) => void;
  PreviewComponent?: React.ReactNode;
}

function isDirectMediaUrl(value: string | null | undefined): boolean {
  return Boolean(value && isAllowedMediaSource(value));
}

function getInitialMediaUrl(material: Material): string {
  if (isDirectMediaUrl(material.file_path)) return material.file_path as string;
  if (isDirectMediaUrl(material.file_url)) return material.file_url;
  return pendingMediaDataUrl;
}

export function resolveGalleryMediaUrl(material: Material, resolvedUrl?: string): string {
  if (!resolvedUrl) return getInitialMediaUrl(material);
  return resolvedUrl;
}

export function resolveGalleryVideoSrc(url: string, origin?: string): string | undefined {
  return toPlayableVideoSrc(url, origin);
}

export function resolveGalleryPreviewUrl(material: Material, resolvedUrl: string, origin?: string): string {
  const previewUrl = isPendingMediaUrl(resolvedUrl)
    ? (material.file_path || material.file_url || resolvedUrl)
    : resolvedUrl;
  if (material.material_type !== 'video') return previewUrl;
  return toPlayableVideoSrc(previewUrl, origin) || unavailableMediaDataUrl;
}

function MediaThumbnail({
  url,
  type,
  onClick,
  size = 'md',
  responsive,
  unavailable,
}: {
  url: string;
  type: 'image' | 'video';
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xs';
  responsive?: boolean;
  unavailable?: boolean;
}) {
  const sizeClass =
    size === 'xs'
      ? 'h-8 w-8'
      : size === 'sm'
        ? 'h-16 w-16'
        : size === 'lg'
          ? 'h-32 w-32'
          : 'h-20 w-20';

  const isImagePlaceholder = url.startsWith('data:image/');
  const isPendingVideo = type === 'video' && isPendingMediaUrl(url);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter') {
      onClick();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || event.key !== ' ') return;
    onClick();
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'relative overflow-hidden rounded border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onClick && 'cursor-pointer',
        !responsive && sizeClass,
        responsive && 'aspect-square w-full',
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {unavailable ? (
        <div className="flex h-full w-full items-center justify-center bg-muted px-2 text-center text-xs text-muted-foreground">
          素材不可用
        </div>
      ) : type === 'video' && !isImagePlaceholder && !isPendingVideo ? (
        <>
          <video
            src={resolveGalleryVideoSrc(url)}
            className="h-full w-full object-cover"
            muted
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <svg
              className="h-6 w-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </>
      ) : isPendingVideo ? (
        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          加载中
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            const img = event.currentTarget;
            if (!isUnavailableMediaUrl(img.src)) img.src = unavailableMediaDataUrl;
          }}
        />
      )}
    </div>
  );
}

const mobileColMap: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const smColMap: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
};

const lgColMap: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export function MediaGallery({
  materials,
  size = 'md',
  responsive,
  columns = { mobile: 3, sm: 4, lg: 5 },
  gap = 'gap-2',
  className,
  onPreview,
  PreviewComponent,
}: MediaGalleryProps) {
  const internal = useImagePreview();
  const open = onPreview || internal.open;
  const preview = PreviewComponent ?? <internal.PreviewComponent />;

  // Batch resolve presigned URLs for all materials
  const presignMaterials = useMemo(
    () => materials.map((m) => ({ id: m.id, file_url: m.file_url, file_path: m.file_path })),
    [materials],
  );
  const presignedMap = usePresignedUrls(
    presignMaterials,
    { unavailableUrl: unavailableMediaDataUrl },
  );

  if (!materials || materials.length === 0) return null;

  const gridCols = cn(
    mobileColMap[columns.mobile],
    columns.sm && smColMap[columns.sm],
    columns.lg && lgColMap[columns.lg],
  );

  return (
    <>
      <div className={cn('grid min-w-0', gridCols, gap, className)}>
        {materials.map((mat) => {
          const resolvedUrl = resolveGalleryMediaUrl(mat, presignedMap.get(mat.id));
          const previewUrl = resolveGalleryPreviewUrl(mat, resolvedUrl);
          const pending = isPendingMediaUrl(resolvedUrl);
          const unavailable = isUnavailableMediaUrl(resolvedUrl);
          return (
            <MediaThumbnail
              key={mat.id}
              url={resolvedUrl}
              type={mat.material_type === 'video' ? 'video' : 'image'}
              onClick={pending || unavailable ? undefined : () => open(previewUrl)}
              size={size}
              responsive={responsive}
              unavailable={unavailable}
            />
          );
        })}
      </div>
      {!onPreview && preview}
    </>
  );
}
