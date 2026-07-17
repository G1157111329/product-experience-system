'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from 'react';
import { Camera, Check, ChevronDown, Film, Image as ImageIcon, Link2, Package, Play, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useImagePreview } from '@/components/image-preview';
import { ImageEditorDialog, type SaveMode } from '@/components/image-editor-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getMediaSrc, isPendingMediaUrl, pendingMediaDataUrl, toPlayableVideoSrc, usePresignedUrls } from '@/lib/use-presigned-url';
import type { EvidenceBindingTarget, Material, MaterialEvidenceFilter } from '../types';

type MaterialEvidenceRailProps = {
  taskId: string;
  bindingTarget: EvidenceBindingTarget | null;
  onMaterialsChange?: (materials: Material[]) => void;
  embedded?: boolean;
  compact?: boolean;
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
  return Boolean(material.record_id || material.recipe_step_id || material.recipe_id || material.comparison_cell_id);
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

function getMaterialPreviewUrl(material: Material, displayUrl: string) {
  return isPendingMediaUrl(displayUrl) ? (material.file_path || material.file_url || '') : displayUrl;
}

function getMaterialDisplayUrl(material: Material, signedUrl?: string) {
  if (signedUrl) return signedUrl;
  const fallback = getMediaSrc(material);
  if (!fallback) return '';
  if (/^(https?:|data:|\/api\/materials\/file\/|\/uploads\/|\/media\/)/.test(fallback)) return fallback;
  return pendingMediaDataUrl;
}

export function MaterialEvidenceRail({ taskId, bindingTarget, onMaterialsChange, embedded = false }: MaterialEvidenceRailProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState<MaterialEvidenceFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingImage, setEditingImage] = useState<{ id: string; url: string; name: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraImageRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    const handleTaskMaterialsChanged = ((event: CustomEvent<{ taskId?: string }>) => {
      if (event.detail?.taskId === taskId) void fetchMaterials();
    }) as EventListener;

    window.addEventListener('task-materials:changed', handleTaskMaterialsChanged);
    return () => window.removeEventListener('task-materials:changed', handleTaskMaterialsChanged);
  }, [fetchMaterials, taskId]);

  const filteredMaterials = useMemo(
    () => materials.filter((material) => matchesFilter(material, filter)),
    [filter, materials]
  );

  const unlinkedCount = materials.filter((material) => !isLinked(material)).length;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleUpload = useCallback(async (files: File[] | FileList | null) => {
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
  }, [fetchMaterials, taskId]);

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    const clipboard = event.clipboardData;
    const filesFromItems = Array.from(clipboard.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const files = filesFromItems.length > 0
      ? filesFromItems
      : Array.from(clipboard.files || []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;
    event.preventDefault();
    void handleUpload(files);
  };

  const handleEditImageSave = async (editedFile: File, mode: SaveMode) => {
    if (!editingImage) return;
    const formData = new FormData();
    formData.append('file', editedFile);
    const overwrite = mode === 'overwrite';
    if (!overwrite) {
      formData.append('task_id', taskId);
      formData.append('copy_source_file_name', editingImage.name);
    }
    setUploading(true);
    try {
      const res = await fetch(overwrite ? `/api/materials/${editingImage.id}/replace` : '/api/materials/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.message || '保存失败');
      toast.success(overwrite ? '图片已保存，原关联保持不变' : '编辑副本已保存');
      await fetchMaterials();
      setEditingImage(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存编辑图片失败');
    } finally {
      setUploading(false);
    }
  };

  const handleBindSelected = async () => {
    if (!bindingTarget || selectedIds.length === 0) return;

    const payload =
      bindingTarget.type === 'record'
        ? { record_id: bindingTarget.id }
        : bindingTarget.type === 'recipe_step'
          ? { recipe_step_id: bindingTarget.id }
          : { recipe_id: bindingTarget.id };

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

    await Promise.all(selectedIds.map(async (id) => {
      const response = await fetch(`/api/materials?id=${id}&detach_mutable_references=1`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code !== 0) throw new Error(data.message || '素材删除失败');
    }));

    toast.success(`已删除 ${selectedIds.length} 个素材`);
    setSelectedIds([]);
    await fetchMaterials();
  };

  return (
    <section aria-label="任务级素材证据" data-testid="task-evidence-upload" tabIndex={0} onPaste={handlePaste} className={cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', embedded ? 'space-y-3' : 'rounded-lg border bg-card p-3 shadow-sm')}>
      <PreviewComponent />
      <ImageEditorDialog
        open={editingImage !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setEditingImage(null); }}
        imageUrl={editingImage?.url || ''}
        fileName={editingImage?.name || 'image'}
        onSave={handleEditImageSave}
      />
      {/* 嵌入窄侧栏时始终保持纵向：标题在上，按钮在下，避免按钮块覆盖“素材证据”标题 */}
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="whitespace-nowrap text-sm font-semibold">素材证据</h2>
            <Badge variant="secondary">{materials.length} 个素材</Badge>
            {unlinkedCount > 0 && <Badge variant="outline">{unlinkedCount} 个未关联</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={uploading} className="whitespace-nowrap">
                <Upload className="mr-1.5 h-4 w-4" />{uploading ? '上传中…' : '添加素材'}
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => cameraImageRef.current?.click()}><Camera className="h-4 w-4" />拍照</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cameraVideoRef.current?.click()}><Video className="h-4 w-4" />录像</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}><ImageIcon className="h-4 w-4" />选择图片</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => videoInputRef.current?.click()}><Film className="h-4 w-4" />选择视频</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">可直接粘贴剪贴板图片</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              'whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              filter === item.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            )}
          >
            {item.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={fetchMaterials} className="ml-auto whitespace-nowrap">
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
              const resolvedUrl = getMaterialDisplayUrl(material, presignedUrls.get(material.id));
              const previewUrl = getMaterialPreviewUrl(material, resolvedUrl);
              const isPendingVideo = material.material_type === 'video' && isPendingMediaUrl(resolvedUrl);
              return (
                <button
                  key={material.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-material-id', material.id);
                    event.dataTransfer.setData('text/plain', material.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => toggleSelected(material.id)}
                  onDoubleClick={() => {
                    if (!previewUrl) return;
                    open(previewUrl, material.material_type === 'image' ? {
                      onEdit: (resolvedUrl) => setEditingImage({ id: material.id, url: resolvedUrl, name: material.file_name }),
                    } : undefined);
                  }}
                  className={cn(
                    'group relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border text-left transition',
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                  )}
                >
                  {material.material_type === 'image' ? (
                    <img src={resolvedUrl} alt={material.file_name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      {isPendingVideo ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">加载中</div>
                      ) : (
                        <video src={toPlayableVideoSrc(resolvedUrl)} className="h-full w-full object-cover" muted preload="metadata" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </div>
                    </>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <div className="truncate text-xs text-white">{material.file_name}</div>
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
        <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
          <div className="whitespace-nowrap text-sm text-muted-foreground">已选择 {selectedIds.length} 个素材</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="whitespace-nowrap">
              <X className="mr-1.5 h-4 w-4" />取消
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeleteSelected} className="whitespace-nowrap text-muted-foreground hover:text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" />删除素材
            </Button>
            <Button size="sm" onClick={handleBindSelected} disabled={!bindingTarget} className="whitespace-nowrap">
              <Link2 className="mr-1.5 h-4 w-4" />
              {bindingTarget ? `绑定到${bindingTarget.label}` : '先选择记录/步骤'}
            </Button>
          </div>
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <input ref={cameraImageRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
      <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={async (event) => { await handleUpload(event.target.files); event.target.value = ''; }} />
    </section>
  );
}
