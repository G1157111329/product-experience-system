'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MediaThumbnail, useImagePreview } from '@/components/image-preview';

export interface MediaGalleryProps {
  materials: Array<{ id: string; file_url: string; file_name?: string; material_type: string }>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  responsive?: boolean;
  columns?: { mobile: number; sm?: number; lg?: number };
  gap?: string;
  className?: string;
  onPreview?: (url: string) => void;
  PreviewComponent?: ReactNode;
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

  if (!materials || materials.length === 0) return null;

  const gridCols = cn(
    mobileColMap[columns.mobile],
    columns.sm && smColMap[columns.sm],
    columns.lg && lgColMap[columns.lg],
  );

  return (
    <>
      <div className={cn('grid min-w-0', gridCols, gap, className)}>
        {materials.map((mat) => (
          <MediaThumbnail
            key={mat.id}
            url={mat.file_url}
            type={mat.material_type === 'video' ? 'video' : 'image'}
            onClick={() => open(mat.file_url)}
            size={size}
            responsive={responsive}
          />
        ))}
      </div>
      {!onPreview && preview}
    </>
  );
}
