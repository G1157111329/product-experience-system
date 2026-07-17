'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  isAllowedMediaSource,
  pendingMediaDataUrl,
  unavailableMediaDataUrl,
  usePresignedUrls,
} from '@/lib/use-presigned-url';
import { ReportMediaPreview } from './report-media-preview';

export type ReportMediaRole = 'primary' | 'evidence' | 'function-evidence' | 'appendix' | 'compact' | 'matrix';

export interface ReportMediaItem {
  id: string;
  name: string;
  type: string;
  url: string;
  duration?: string;
}

export interface ReportMediaPresentation {
  limit: number;
  imageAspect: '4/3';
  videoAspect: '16/9';
  minWidth: number;
  maxWidth: number | null;
}

const PRESENTATIONS: Record<ReportMediaRole, ReportMediaPresentation> = {
  primary: { limit: 6, imageAspect: '4/3', videoAspect: '16/9', minWidth: 112, maxWidth: null },
  evidence: { limit: 4, imageAspect: '4/3', videoAspect: '16/9', minWidth: 80, maxWidth: 80 },
  'function-evidence': { limit: 10, imageAspect: '4/3', videoAspect: '16/9', minWidth: 96, maxWidth: 96 },
  appendix: { limit: 4, imageAspect: '4/3', videoAspect: '16/9', minWidth: 80, maxWidth: 80 },
  compact: { limit: 2, imageAspect: '4/3', videoAspect: '16/9', minWidth: 80, maxWidth: 80 },
  matrix: { limit: Number.MAX_SAFE_INTEGER, imageAspect: '4/3', videoAspect: '16/9', minWidth: 64, maxWidth: 64 },
};

export function mediaPresentation(role: ReportMediaRole): ReportMediaPresentation {
  return PRESENTATIONS[role];
}

export function visibleMedia<T>(items: T[], role: ReportMediaRole, expanded = false) {
  const limit = mediaPresentation(role).limit;
  return expanded || items.length <= limit
    ? { items, remaining: 0 }
    : { items: items.slice(0, limit), remaining: items.length - limit };
}

export function mediaExpansionSignature(
  role: ReportMediaRole,
  items: Array<Pick<ReportMediaItem, 'id' | 'url'>>,
  carrierKey = '',
) {
  return `${carrierKey}|${role}|${items.map((item) => `${item.id}:${item.url}`).join('|')}`;
}

export function isMediaExpanded(expandedSignature: string | null, currentSignature: string) {
  return expandedSignature === currentSignature;
}

export function ReportMediaGrid({
  items,
  role,
  label,
  className,
  carrierKey,
  adaptiveThumbnail = false,
}: {
  items: ReportMediaItem[];
  role: ReportMediaRole;
  label?: string;
  className?: string;
  carrierKey?: string;
  /** Fit every matrix attachment inside the frozen table without truncation or a scroll rail. */
  adaptiveThumbnail?: boolean;
}) {
  const signature = mediaExpansionSignature(role, items, carrierKey);
  const [expandedSignature, setExpandedSignature] = useState<string | null>(null);
  const expanded = isMediaExpanded(expandedSignature, signature);
  const presigned = usePresignedUrls(items.map((item) => ({
    id: item.id,
    file_url: item.url,
    file_path: item.url,
  })), { unavailableUrl: unavailableMediaDataUrl });
  if (items.length === 0) return null;
  const visible = visibleMedia(items, role, expanded);
  const presentation = mediaPresentation(role);
  const canCollapse = expanded && items.length > presentation.limit;
  const gridTemplateColumns = adaptiveThumbnail
    ? 'repeat(auto-fill, minmax(clamp(32px, 6cqi, 52px), clamp(32px, 6cqi, 52px)))'
    : presentation.maxWidth === null
    ? `repeat(auto-fit, minmax(${presentation.minWidth}px, 1fr))`
    : `repeat(auto-fill, minmax(${presentation.minWidth}px, ${presentation.maxWidth}px))`;

  return (
    <section
      data-testid={`report-media-grid-${role}`}
      data-media-role={role}
      className={cn('min-w-0 space-y-2', className)}
    >
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className={cn('grid min-w-0 justify-start', adaptiveThumbnail ? 'gap-1' : 'gap-2')} style={{ gridTemplateColumns }}>
        {visible.items.map((item) => (
          <ReportMediaPreview
            key={item.id}
            item={item}
            role={role}
            resolvedUrl={presigned.get(item.id) ?? (isAllowedMediaSource(item.url) ? item.url : pendingMediaDataUrl)}
          />
        ))}
        {visible.remaining > 0 && (
          <button
            type="button"
            data-testid="report-media-more"
            className="aspect-[4/3] min-h-11 min-w-11 rounded-lg border border-dashed bg-muted/20 text-sm font-medium text-muted-foreground hover:bg-muted/40"
            onClick={() => setExpandedSignature(signature)}
          >
            +{visible.remaining}
          </button>
        )}
      </div>
      {canCollapse && (
        <button
          type="button"
          data-testid="report-media-collapse"
          className="min-h-11 min-w-11 text-xs text-primary hover:underline"
          onClick={() => setExpandedSignature(null)}
        >
          收起
        </button>
      )}
    </section>
  );
}
