'use client';

/**
 * MatrixV3MediaCell — D (primary_media) / O (effect_media) slot UI.
 * Binds via POST /api/v1/matrices/{id}/cells/{leaf}/{col}/media and
 * unbinds via DELETE /api/v1/material-links/{linkId}.
 */
import { useMemo, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { MediaThumbnail } from '@/components/image-preview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { V3CellMedia, V3Column } from '@/lib/matrix/v3-types';

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
  const maxCount = column.maxMediaCount ?? (column.columnZone === 'primary_media' ? 3 : 12);
  const imagesOnly = column.dataType === 'image_slot' || column.columnZone === 'primary_media';

  const initialMaterials = useMemo(() => media.map(toPickerMaterial), [media]);
  const selectedIds = useMemo(() => media.map((m) => m.materialId), [media]);
  const linkByMaterialId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of media) map.set(m.materialId, m.linkId);
    return map;
  }, [media]);

  const mediaUrl = `/api/v1/matrices/${matrixId}/cells/${leafRowId}/${column.id}/media`;

  const bindMaterial = async (materialId: string) => {
    const res = await fetch(mediaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId }),
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || '绑定失败');
  };

  const unbindLink = async (linkId: string) => {
    const res = await fetch(`/api/v1/material-links/${linkId}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({ code: res.ok ? 0 : 1 }));
    if (json.code !== 0 && !res.ok) throw new Error(json.message || '解绑失败');
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
      for (const id of toRemove) {
        const linkId = linkByMaterialId.get(id);
        if (linkId) await unbindLink(linkId);
      }
      for (const id of toAdd) {
        await bindMaterial(id);
      }
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
    setSaving(true);
    try {
      await unbindLink(linkId);
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
      await bindMaterial(materialId);
      onChanged();
      toast.success('已绑定素材');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '绑定失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="px-1 py-1 min-h-[36px] space-y-1"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-material-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="flex flex-wrap gap-1 items-center">
        {media.slice(0, maxCount).map((m) => (
          <div key={m.linkId} className="relative group">
            <MediaThumbnail
              url={m.fileUrl || m.thumbnailUrl || ''}
              type={m.materialType === 'video' ? 'video' : 'image'}
              size="xs"
            />
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
          className={cn('h-7 gap-1 text-[10px] px-1.5', saving && 'opacity-70')}
          disabled={saving}
          onClick={() => setOpen(true)}
          title={imagesOnly ? '选择/上传图片' : '选择/上传素材'}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          {media.length}/{maxCount}
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
      />
    </div>
  );
}
