'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Film, Image as ImageIcon, Link2, Package, Play, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { MediaCaptureDialog } from '@/components/media-capture-dialog';
import { useImagePreview } from '@/components/image-preview';
import { cn } from '@/lib/utils';
import { usePresignedUrls } from '@/lib/use-presigned-url';
import type { EvidenceBindingTarget, Material, MaterialEvidenceFilter } from '../types';

type MaterialEvidenceRailProps = {
  taskId: string;
  bindingTarget: EvidenceBindingTarget | null;
  onMaterialsChange?: (materials: Material[]) => void;
};

const filters: Array<{ key: MaterialEvidenceFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unlinked', label: '未关联' },
  { key: 'linked', label: '已关联' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'senses', label: '五感' },
  { key: 'functions', label: '步骤' },
  { key: 'effect', label: '效果' },
];

function isLinked(material: Material) {
  return Boolean(material.record_id || material.recipe_step_id || material.recipe_id);
}

function matchesFilter(material: Material, filter: MaterialEvidenceFilter) {
  if (filter === 'all') return true;
  if (filter === 'unlinked') return !isLinked(material);
  if (filter === 'linked') return isLinked(material);
  if (filter === 'image') return material.material_type === 'image';
  if (filter === 'video') return material.material_type === 'video';
  if (filter === 'senses') return Boolean(material.record_id);
  if (filter === 'functions') return Boolean(material.recipe_step_id);
  if (filter === 'effect') return Boolean(material.recipe_id);
  return true;
}

export function MaterialEvidenceRail({ taskId, bindingTarget, onMaterialsChange }: MaterialEvidenceRailProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState<MaterialEvidenceFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { open, PreviewComponent } = useImagePreview();
  const presignedUrls = usePresignedUrls(materials);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/materials?task_id=${taskId}`);
      const data = await res.json();
      const nextMaterials = data.code === 0 ? data.data || [] : [];
      setMaterials(nextMaterials);
      onMaterialsChange?.(nextMaterials);
    } finally {
      setLoading(false);
    }
  }, [onMaterialsChange, taskId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const filteredMaterials = useMemo(
    () => materials.filter((material) => matchesFilter(material, filter)),
    [filter, materials]
  );

  const unlinkedCount = materials.filter((material) => !isLinked(material)).length;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleUpload = async (files: File[] | FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} 超过100MB`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        const toastId = `upload-${file.name}`;
        toast.loading(`正在上传 ${file.name}...`, { id: toastId });

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);
          const res = await fetch('/api/materials/upload', { method: 'POST', body: formData, signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (data.code === 0) toast.success(`${file.name} 上传成功`, { id: toastId });
          else toast.error(data.message || '上传失败', { id: toastId });
        } catch {
          toast.error('上传失败', { id: toastId });
        }
      }

      await fetchMaterials();
    } finally {
      setUploading(false);
    }
  };

  const handleBindSelected = async () => {
    if (!bindingTarget || selectedIds.length === 0) return;

    const payload =
      bindingTarget.type === 'record'
        ? { record_id: bindingTarget.id, recipe_step_id: null, recipe_id: null }
        : bindingTarget.type === 'recipe_step'
          ? { recipe_step_id: bindingTarget.id, record_id: null, recipe_id: null }
          : { recipe_id: bindingTarget.id, record_id: null, recipe_step_id: null };

    await Promise.all(
      selectedIds.map((id) =>
        fetch('/api/materials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...payload }),
        })
      )
    );

    toast.success(`已绑定 ${selectedIds.length} 个素材`);
    setSelectedIds([]);
    await fetchMaterials();
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`确认删除选中的 ${selectedIds.length} 个素材？删除后会从所有已绑定位置移除。`);
    if (!confirmed) return;

    await Promise.all(
      selectedIds.map((id) => fetch(`/api/materials?id=${id}`, { method: 'DELETE' }))
    );

    toast.success(`已删除 ${selectedIds.length} 个素材`);
    setSelectedIds([]);
    await fetchMaterials();
  };

  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <PreviewComponent />
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">素材证据</h2>
            <Badge variant="secondary">{materials.length} 个素材</Badge>
            {unlinkedCount > 0 && <Badge variant="outline">{unlinkedCount} 个未关联</Badge>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">先整理手机拍摄的图片/视频，再绑定到五感记录、功能步骤或效果评价。</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:flex">
          <Button variant="outline" size="sm" onClick={() => setCaptureMode('image')} disabled={uploading}>
            <Camera className="mr-1.5 h-4 w-4" />拍照
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCaptureMode('video')} disabled={uploading}>
            <Video className="mr-1.5 h-4 w-4" />录像
          </Button>
          <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
            <ImageIcon className="mr-1.5 h-4 w-4" />图片
          </Button>
          <Button variant="outline" size="sm" onClick={() => videoInputRef.current?.click()} disabled={uploading}>
            <Film className="mr-1.5 h-4 w-4" />视频
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              filter === item.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >
            {item.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={fetchMaterials} className="ml-auto">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>

      <ScrollArea className="mt-3 w-full">
        <div className="flex gap-2 pb-3">
          {loading ? (
            [1, 2, 3, 4, 5].map((item) => <div key={item} className="h-24 w-32 shrink-0 animate-pulse rounded-lg bg-muted" />)
          ) : filteredMaterials.length === 0 ? (
            <div className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              <Package className="mr-2 h-4 w-4" />暂无匹配素材
            </div>
          ) : (
            filteredMaterials.map((material) => {
              const selected = selectedIds.includes(material.id);
              const resolvedUrl = presignedUrls.get(material.id) || material.file_url;
              return (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => toggleSelected(material.id)}
                  onDoubleClick={() => open(resolvedUrl)}
                  className={cn(
                    'group relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border text-left transition',
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                  )}
                >
                  {material.material_type === 'image' ? (
                    <img src={resolvedUrl} alt={material.file_name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <video src={resolvedUrl} className="h-full w-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </div>
                    </>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <div className="truncate text-[10px] text-white">{material.file_name}</div>
                  </div>
                  <div className="absolute left-1.5 top-1.5 rounded-full bg-background/90 p-1">
                    {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-center">
          <div className="text-sm text-muted-foreground">已选择 {selectedIds.length} 个素材</div>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              <X className="mr-1.5 h-4 w-4" />取消
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="mr-1.5 h-4 w-4" />删除素材
            </Button>
            <Button size="sm" onClick={handleBindSelected} disabled={!bindingTarget}>
              <Link2 className="mr-1.5 h-4 w-4" />
              {bindingTarget ? `绑定到${bindingTarget.label}` : '先选择记录/步骤'}
            </Button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <MediaCaptureDialog
        mode={captureMode || 'image'}
        open={captureMode !== null}
        onOpenChange={(open) => setCaptureMode(open ? (captureMode || 'image') : null)}
        onCapture={(file) => handleUpload([file])}
        busy={uploading}
      />
    </section>
  );
}
