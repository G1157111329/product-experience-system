'use client';

import { Button } from '@/components/ui/button';
import type { MatrixZoneAnchor } from '@/lib/matrix/matrix-zone-layout';

export function MatrixZoneNavigator({
  anchors,
  onSelect,
}: {
  anchors: readonly MatrixZoneAnchor[];
  onSelect: (scrollLeft: number) => void;
}) {
  if (anchors.length === 0) return null;

  return (
    <nav aria-label="数据矩阵分区" className="hidden md:flex items-center gap-1 overflow-x-auto pb-1">
      {anchors.map((anchor) => (
        <Button
          key={anchor.zone}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => onSelect(anchor.scrollLeft)}
        >
          {anchor.label}
        </Button>
      ))}
    </nav>
  );
}
