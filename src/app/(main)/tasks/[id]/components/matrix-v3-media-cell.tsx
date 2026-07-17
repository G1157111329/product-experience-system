'use client';

/**
 * MatrixV3MediaCell — D (primary_media) / O (effect_media) slot UI.
 * Every existing-asset selection, drop, and removal replaces the complete
 * cell selection through one atomic material-links command.
 */
import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { MediaThumbnail, useImagePreview } from '@/components/image-preview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { V3CellMedia, V3Column } from '@/lib/matrix/v3-types';

export function nextMaterialIdsForMatrixSelection(current: readonly string[], action: { add: string } | { remove: string }) {
  if ('add' in action) return [...new Set([...current, action.add])];
  return current.filter((materialId) => materialId !== action.remove);
}

interface MatrixV3MediaCellProps {
  matrixId: string;
  taskId: string;
  leafRowId: string;
  column: V3Column;
  media: V3CellMedia[];
  onChanged: () => void;
}

function toPickerMaterial(m: V3CellMedia): Material {
  return {
    id: m.materialId,
    material_type: m.materialType,
    file_name: m.fileName ?? '',
    file_url: m.fileUrl ?? '',
    file_size: 0,
    record_id: null,
    recipe_step_id: null,
    recipe_id: null,
    issue_id: null,
    re_evaluation_id: null,
  };
}

export function MatrixV3MediaCell({
  matrixId,
  taskId,
  leafRowId,
  column,
  media,
  onChanged,
}: MatrixV3MediaCellProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const preview = useImagePreview();
  const maxCount = column.maxMediaCount ?? (column.columnZone === 'primary_media' ? 3 : 12);
  const imagesOnly = column.dataType === 'image_slot' || column.columnZone === 'primary_media';

  const initialMaterials = useMemo(() => media.map(toPickerMaterial), [media]);
  const selectedIds = useMemo(() => media.map((m) => m.materialId), [media]);
  const replaceSelection = async (materialIds: string[]) => {
    const replacement = await fetch('/api/v1/material-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matrixCell: { matrixId, leafRowId, columnId: column.id, materialIds } }),
    });
    const result = await replacement.json().catch(() => null) as { code?: number; message?: string } | null;
    if (!replacement.ok || result?.code !== 0) throw new Error(result?.message || '素材替换失败');
  };

  const handleSelectionChange = async (ids: string[]) => {
    const current = new Set(selectedIds);
    const nextIds = ids.slice(0, maxCount);
    const next = new Set(nextIds);
    const toAdd = nextIds.filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !next.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    setSaving(true);
    try {
      await replaceSelection(nextIds);
      if (ids.length > maxCount) {
        toast.message(`最多 ${maxCount} 个素材，已截断`);
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '素材更新失败');
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (linkId: string) => {
    const target = media.find((item) => item.linkId === linkId);
    if (!target) return;
    setSaving(true);
    try {
      await replaceSelection(nextMaterialIdsForMatrixSelection(selectedIds, { remove: target.materialId }));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const materialId = e.dataTransfer.getData('application/x-material-id');
    if (!materialId) return;
    if (selectedIds.includes(materialId)) {
      toast.message('该素材已绑定');
      return;
    }
    if (media.length >= maxCount) {
      toast.error(`最多 ${maxCount} 个素材`);
      return;
    }
    setSaving(true);
    try {
      await replaceSelection(nextMaterialIdsForMatrixSelection(selectedIds, { add: materialId }));
      onChanged();
      toast.success('已绑定素材');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div
      data-testid="matrix-media-slot"
      className="h-9 overflow-hidden px-1 py-1"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-material-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="flex h-7 flex-nowrap items-center gap-1 overflow-hidden">
        {media.slice(0, maxCount).map((m) => (
          <div key={m.linkId} className="relative shrink-0 group">
            <button
              type="button"
              className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`查看素材 ${m.fileName || ''}`}
              onClick={() => preview.open(m.fileUrl || m.thumbnailUrl || '')}
            >
            <MediaThumbnail
              url={m.fileUrl || m.thumbnailUrl || ''}
              type={m.materialType === 'video' ? 'video' : 'image'}
              size="xs"
            />
            </button>
            <button
              type="button"
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center"
              title="移除"
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation();
                void handleRemove(m.linkId);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('h-7 w-7 shrink-0 p-0', saving && 'opacity-70')}
          disabled={saving}
          onClick={() => setOpen(true)}
          aria-label="添加素材"
          title={imagesOnly ? '选择/上传图片' : '选择/上传素材'}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <MaterialPicker
        taskId={taskId}
        open={open}
        onOpenChange={setOpen}
        selectedIds={selectedIds}
        initialMaterials={initialMaterials}
        onSelectionChange={(ids) => {
          // D column: drop videos from selection client-side.
          const filtered = imagesOnly
            ? ids.filter((id) => {
                const m = initialMaterials.find((x) => x.id === id);
                // Allow newly selected ids from picker library; server enforces image_slot.
                return !m || m.material_type !== 'video';
              })
            : ids;
          void handleSelectionChange(filtered);
        }}
        enableImageEditing
      />
    </div>
    <preview.PreviewComponent />
    </>
  );
}
