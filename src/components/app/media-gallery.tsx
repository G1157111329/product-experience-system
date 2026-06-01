'use client';

import { useImagePreview } from '@/components/image-preview';
import { usePresignedUrls } from '@/lib/use-presigned-url';
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

function MediaThumbnail({
  url,
  type,
  onClick,
  size = 'md',
  responsive,
}: {
  url: string;
  type: 'image' | 'video';
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xs';
  responsive?: boolean;
}) {
  const sizeClass =
    size === 'xs'
      ? 'h-8 w-8'
      : size === 'sm'
        ? 'h-16 w-16'
        : size === 'lg'
          ? 'h-32 w-32'
          : 'h-20 w-20';

  return (
    <div
      className={cn(
        'relative cursor-pointer overflow-hidden rounded border bg-muted',
        !responsive && sizeClass,
        responsive && 'aspect-square w-full',
      )}
      onClick={onClick}
    >
      {type === 'video' ? (
        <>
          <video
            src={url}
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
      ) : (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
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
  const presignedMap = usePresignedUrls(
    materials.map((m) => ({ id: m.id, file_url: m.file_url, file_path: m.file_path }))
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
          const resolvedUrl = presignedMap.get(mat.id) || mat.file_url;
          return (
            <MediaThumbnail
              key={mat.id}
              url={resolvedUrl}
              type={mat.material_type === 'video' ? 'video' : 'image'}
              onClick={() => open(resolvedUrl)}
              size={size}
              responsive={responsive}
            />
          );
        })}
      </div>
      {!onPreview && preview}
    </>
  );
}
