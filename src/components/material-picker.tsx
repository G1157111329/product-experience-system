'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Plus, Loader2, Film, Image as ImageIcon, Camera, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ImagePreview, MediaThumbnail } from './image-preview';
import { ImageEditorDialog, type SaveMode } from './image-editor-dialog';
import { MediaCaptureDialog } from './media-capture-dialog';
import { resolveMaterialEditSaveMode } from '@/lib/material-edit-policy';
import { cn } from '@/lib/utils';
import { getMediaSrc, isPendingMediaUrl, pendingMediaDataUrl, usePresignedUrls } from '@/lib/use-presigned-url';
import { toast } from 'sonner';
import { orderMaterialsByIds } from '@/lib/material-selection-order';

export interface Material {
  id: string;
  material_type: string;
  file_name: string;
  file_url: string;
  file_path?: string;
  file_size: number;
  record_id: string | null;
  recipe_step_id: string | null;
  recipe_id: string | null;
  issue_id: string | null;
  re_evaluation_id: string | null;
  comparison_cell_id?: string | null;
  comparison_assembly_id?: string | null;
  media_display_order?: number | null;
  media_role?: string | null;
}

type LegacyMaterial = Material & {
  url?: string;
  name?: string;
  size?: number;
  taskId?: string;
  task_id?: string;
};

interface MaterialPickerProps {
  taskId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (material: Material) => void;
  recordId?: string;
  recipeStepId?: string;
  recipeId?: string;
  issueId?: string;
  reEvaluationId?: string;
  comparisonCellId?: string;
  selectedIds?: string[];
  initialMaterials?: Material[];
  onSelectionChange?: (ids: string[], materials: Material[]) => void;
  onPreview?: (url: string) => void;
  selectedPreviewSize?: 'sm' | 'md';
  /** Use an icon trigger and single-line previews in compact matrix cells. */
  compact?: boolean;
  /** Only report-entry surfaces may opt into editing a selected original image. */
  enableImageEditing?: boolean;
}

type FilterType = 'all' | 'image' | 'video';

function inferMaterialType(nameOrUrl: string): 'image' | 'video' {
  const ext = (nameOrUrl.split('.').pop() || '').toLowerCase();
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video';
  return 'image';
}

export function MaterialPicker({
  taskId,
  open: controlledOpen,
  onOpenChange,
  onSelect,
  recordId,
  recipeStepId,
  recipeId,
  issueId,
  reEvaluationId,
  comparisonCellId,
  selectedIds,
  initialMaterials,
  onSelectionChange,
  onPreview,
  selectedPreviewSize = 'sm',
  compact = false,
  enableImageEditing = false,
}: MaterialPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<{ material: Material; url: string } | null>(null);
  const [selected, setSelected] = useState<string[]>(selectedIds || []);
  const [selectedMaterialMap, setSelectedMaterialMap] = useState<Record<string, Material>>(() => {
    const map: Record<string, Material> = {};
    if (initialMaterials) {
      for (const material of initialMaterials) {
        map[material.id] = material;
      }
    }
    return map;
  });

  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement>(null);
  const fetchedForOpenRef = useRef(false);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const allKnownMaterials = useMemo(() => {
    const byId = new Map<string, Material>();
    for (const material of materials) byId.set(material.id, material);
    for (const material of Object.values(selectedMaterialMap)) byId.set(material.id, material);
    return Array.from(byId.values());
  }, [materials, selectedMaterialMap]);
  const presignedUrls = usePresignedUrls(allKnownMaterials);
  const materialUrl = (material: Material) => {
    const signedUrl = presignedUrls.get(material.id);
    // Never feed the image loading placeholder into a <video src> — CSP media-src
    // (and browsers) reject data:image placeholders and spam console errors.
    if (signedUrl) {
      if (isPendingMediaUrl(signedUrl) && material.material_type === 'video') return '';
      return signedUrl;
    }
    const fallback = getMediaSrc(material);
    if (!fallback) return material.file_url;
    if (fallback.startsWith('data:') && material.material_type === 'video') return '';
    if (/^(https?:|data:|\/api\/materials\/file\/|\/uploads\/|\/media\/)/.test(fallback)) return fallback;
    if (material.material_type === 'video') return '';
    return pendingMediaDataUrl;
  };
  const setIsOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    setSelected(selectedIds || []);
  }, [selectedIds]);

  const notifySelectionChange = useCallback((newSelected: string[], newMaterials: Material[]) => {
    setSelectedMaterialMap((prev) => {
      const next = { ...prev };
      for (const material of newMaterials) {
        next[material.id] = material;
      }
      return next;
    });
    onSelectionChange?.(newSelected, newMaterials);
  }, [onSelectionChange]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ task_id: taskId, limit: '200' });
      const res = await fetch(`/api/materials?${params}`);
      const data = await res.json();
      if (data.code !== 0) return;

      let list: Material[] = Array.isArray(data.data) ? data.data : (data.data?.list || []);

      // Map filesystem-based material objects to the Material interface expected
      // by the picker.
      list = list.map((material) => {
        const source = material as LegacyMaterial;
        return {
          ...source,
          material_type: source.material_type || inferMaterialType(source.url || source.name || source.file_name || ''),
          file_url: source.url || source.file_url || '',
          file_name: source.name || source.file_name || source.id || '',
          file_size: source.size ?? source.file_size ?? 0,
          task_id: source.taskId || source.task_id || taskId,
          record_id: source.record_id ?? null,
          recipe_step_id: source.recipe_step_id ?? null,
          recipe_id: source.recipe_id ?? null,
          issue_id: source.issue_id ?? null,
          re_evaluation_id: source.re_evaluation_id ?? null,
        };
      });

      // A material asset is reusable. Existing legacy bindings must never hide
      // it from another business location; choosing it creates a new link for
      // the current target rather than moving the old one.

      setMaterials(list);
      setSelectedMaterialMap((prev) => {
        const next = { ...prev };
        for (const material of list) {
          if (selected.includes(material.id) || selectedIds?.includes(material.id)) {
            next[material.id] = material;
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [taskId, recordId, recipeStepId, recipeId, issueId, onSelect, onSelectionChange, selected, selectedIds]);

  // Controlled consumers (such as a matrix cell) only update `open`; they do
  // not call handleOpen. Load once per open cycle so both controlled and
  // uncontrolled pickers always expose the same task material library.
  useEffect(() => {
    if (!isOpen) {
      fetchedForOpenRef.current = false;
      return;
    }
    if (fetchedForOpenRef.current) return;
    fetchedForOpenRef.current = true;
    void fetchMaterials();
  }, [isOpen, fetchMaterials]);

  const handleOpen = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
  };

  // Sync initialMaterials into selectedMaterialMap so thumbnails and delete buttons show
  useEffect(() => {
    if (initialMaterials && initialMaterials.length > 0) {
      setSelectedMaterialMap((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const m of initialMaterials) {
          if (!next[m.id]) {
            next[m.id] = m;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [initialMaterials]);

  const resetFileInputs = useCallback(() => {
    [
      galleryImageInputRef,
      galleryVideoInputRef,
    ].forEach((inputRef) => {
      if (inputRef.current) inputRef.current.value = '';
    });
  }, []);

  const triggerFilePicker = (inputRef: React.RefObject<HTMLInputElement | null>) => {
    const input = inputRef.current;
    if (!input || uploading) return;
    input.click();
  };

  const uploadFiles = useCallback(async (files: File[], options: { copySourceFileName?: string } = {}) => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      let nextSelected = [...selected];
      const nextMaterials = orderMaterialsByIds(nextSelected, materials);
      let uploadedCount = 0;

      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} 超过100MB`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        if (options.copySourceFileName) formData.append('copy_source_file_name', options.copySourceFileName);
        if (recordId) formData.append('record_id', recordId);
        if (recipeStepId) formData.append('recipe_step_id', recipeStepId);
        if (recipeId) formData.append('recipe_id', recipeId);
        if (issueId) formData.append('issue_id', issueId);
        if (reEvaluationId) formData.append('re_evaluation_id', reEvaluationId);
        if (comparisonCellId) formData.append('comparison_cell_id', comparisonCellId);

        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code !== 0) {
          toast.error(data.message);
          continue;
        }

        const newMaterial = data.data as Material;
        uploadedCount += 1;
        setMaterials((prev) => [...prev, newMaterial]);
        setSelectedMaterialMap((prev) => ({ ...prev, [newMaterial.id]: newMaterial }));

        if (onSelect && !onSelectionChange) {
          onSelect(newMaterial);
          continue;
        }

        if (onSelectionChange) {
          nextSelected = [...nextSelected, newMaterial.id];
          nextMaterials.push(newMaterial);
        }
      }

      if (onSelectionChange) {
        setSelected(nextSelected);
        notifySelectionChange(nextSelected, nextMaterials);
      }

      if (uploadedCount > 0) {
        window.dispatchEvent(new CustomEvent('task-materials:changed', { detail: { taskId } }));
        toast.success('上传成功');
      }
    } finally {
      setUploading(false);
      resetFileInputs();
    }
  }, [
    comparisonCellId,
    issueId,
    materials,
    notifySelectionChange,
    onSelect,
    onSelectionChange,
    reEvaluationId,
    recipeId,
    recipeStepId,
    recordId,
    resetFileInputs,
    selected,
    taskId,
  ]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    // Only handle when the dialog is open.
    if (!isOpen) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        // Assign a proper filename — the upload API validates extension from file.name.
        // Clipboard images are typically image/png; preserve the original type.
        const ext = file.type === 'image/jpeg' ? 'jpg'
          : file.type === 'image/gif' ? 'gif'
          : file.type === 'image/webp' ? 'webp'
          : 'png';  // default to png
        const timestamp = Date.now();
        const namedFile = new File([file], `pasted-${timestamp}-${i}.${ext}`, { type: file.type });
        imageFiles.push(namedFile);
      }
    }

    if (imageFiles.length === 0) return;  // not an image paste — let native handling proceed

    e.preventDefault();  // prevent native paste into any input/textarea
    void uploadFiles(imageFiles);
  }, [isOpen, uploadFiles]);

  // Mount/unmount the paste listener. Listener is on `document` because clipboard
  // paste events fire on the focused element, which may be inside or outside the
  // Dialog DOM; the `isOpen` guard inside handlePaste ensures it only acts when
  // the dialog is visible. Same pattern the matrix grid uses.
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(event.target.files || []));
  };

  const handleCapturedFile = async (file: File) => {
    await uploadFiles([file]);
  };

  const handleSelect = (material: Material) => {
    setSelectedMaterialMap((prev) => ({ ...prev, [material.id]: material }));

    if (onSelect && !onSelectionChange) {
      onSelect(material);
      setIsOpen(false);
      return;
    }

    const nextSelected = selected.includes(material.id)
      ? selected.filter((id) => id !== material.id)
      : [...selected, material.id];

    setSelected(nextSelected);
    if (onSelectionChange) {
      notifySelectionChange(nextSelected, orderMaterialsByIds(nextSelected, allKnownMaterials));
    }
  };

  const handleDeselect = (materialId: string) => {
    const nextSelected = selected.filter((id) => id !== materialId);
    setSelected(nextSelected);
    setSelectedMaterialMap((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });

    if (onSelectionChange) {
      notifySelectionChange(nextSelected, orderMaterialsByIds(nextSelected, allKnownMaterials));
    }
  };

  const filteredMaterials = filterType === 'all'
    ? materials
    : materials.filter((material) => material.material_type === filterType);

  const renderSelectedThumbnails = () => {
    if (selected.length === 0) return null;

    const wrapperClass = selectedPreviewSize === 'md' ? 'w-20 h-20' : 'w-12 h-12';

    return (
      <div className={cn(
        'flex',
        compact ? 'flex-nowrap gap-1.5' : selectedPreviewSize === 'md' ? 'flex-wrap gap-2.5' : 'flex-wrap gap-1.5',
      )}>
        {selected.map((id) => {
          const material = selectedMaterialMap[id];
          if (!material) return null;

          return (
            <div key={id} className={cn('relative rounded-md overflow-hidden border border-border group cursor-pointer', wrapperClass)}
              onClick={(e) => {
                e.stopPropagation();
                const previewSrc = materialUrl(material);
                if (onPreview) {
                  onPreview(previewSrc);
                } else {
                  setPreviewMaterial(material);
                  setPreviewUrl(previewSrc);
                }
              }}>
              <MediaThumbnail url={materialUrl(material)} type={material.material_type as 'image' | 'video'} size={selectedPreviewSize} />
              <button
                type="button"
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeselect(id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPreviewModal = () => {
    if (!previewUrl || !previewMaterial) return null;
    return <ImagePreview
      url={previewUrl}
      mediaType={previewMaterial.material_type}
      onClose={() => { setPreviewUrl(null); setPreviewMaterial(null); }}
      onEdit={enableImageEditing && previewMaterial.material_type === 'image'
        ? (resolvedUrl) => setEditingMaterial({ material: previewMaterial, url: resolvedUrl })
        : undefined}
    />;
  };

  const handleEditedImageSave = async (editedFile: File, requestedMode: SaveMode) => {
    if (!editingMaterial) return;
    const saveMode = resolveMaterialEditSaveMode({ requested: requestedMode, hasFrozenReference: false });
    try {
      if (saveMode === 'save_new') {
        await uploadFiles([editedFile], { copySourceFileName: editingMaterial.material.file_name });
        return;
      }

      const formData = new FormData();
      formData.append('file', editedFile);
      const response = await fetch(`/api/materials/${editingMaterial.material.id}/replace`, { method: 'POST', body: formData });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.code === 0) {
        const updated = payload.data as Material;
        setMaterials((current) => current.map((material) => material.id === updated.id ? { ...material, ...updated } : material));
        setSelectedMaterialMap((current) => ({ ...current, [updated.id]: { ...current[updated.id], ...updated } }));
        toast.success('图片已覆盖保存，原绑定保持不变');
        return;
      }
      if (response.status === 409 && payload.save_mode === 'save_new') {
        await uploadFiles([editedFile], { copySourceFileName: editingMaterial.material.file_name });
        toast.info('原图已被冻结报告引用，已另存为新图片');
        return;
      }
      toast.error(payload.message || '保存编辑图片失败');
    } finally {
      setEditingMaterial(null);
    }
  };

  const renderFilterButtons = () => (
    <div className="flex gap-1 ml-auto">
      {([
        ['all', '全部'],
        ['image', '图片'],
        ['video', '视频'],
      ] as const).map(([value, label]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={filterType === value ? 'default' : 'outline'}
          className="h-7 text-xs px-2"
          onClick={() => setFilterType(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  const renderUploadActions = () => (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={() => setCaptureMode('image')}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          拍照
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={() => setCaptureMode('video')}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
          录像
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => triggerFilePicker(galleryImageInputRef)}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          相册图片
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => triggerFilePicker(galleryVideoInputRef)}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
          相册视频
        </Button>
        {renderFilterButtons()}
      </div>
      <input ref={galleryImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      <input ref={galleryVideoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleUpload} />
      <MediaCaptureDialog
        mode={captureMode || 'image'}
        open={captureMode !== null}
        onOpenChange={(open) => setCaptureMode(open ? (captureMode || 'image') : null)}
        onCapture={handleCapturedFile}
        busy={uploading}
      />
    </>
  );

  const renderDialogBody = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        {renderUploadActions()}
        <p className="text-xs text-muted-foreground text-center pt-1">
          也可以直接粘贴图片 (Ctrl/Cmd+V)
        </p>
      </div>
      {/* Native overflow — Radix ScrollArea inside draggable Dialog often clips
          at ~12 thumbnails and swallows scrollbar / wheel interaction. */}
      <div
        data-testid="material-picker-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        style={{ maxHeight: 'min(50vh, 28rem)' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">暂无素材，请先上传</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-1">
            {filteredMaterials.map((material) => (
              <div
                key={material.id}
                data-testid="material-picker-item"
                data-material-id={material.id}
                className="relative cursor-pointer"
                onClick={() => handleSelect(material)}
              >
                <MediaThumbnail url={materialUrl(material)} type={material.material_type as 'image' | 'video'} responsive />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate rounded-b-lg">
                  {material.material_type === 'video'
                    ? <Film className="h-2.5 w-2.5 inline mr-0.5" />
                    : <ImageIcon className="h-2.5 w-2.5 inline mr-0.5" />}
                  {material.file_name}
                </div>
                {selected.includes(material.id) && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px]">
                    ✓
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (controlledOpen === undefined && onOpenChange === undefined) {
    return (
      <>
        <div className={cn(compact ? 'flex h-12 items-center gap-2 overflow-hidden' : 'space-y-1.5')}>
          <div className="flex shrink-0 items-center gap-2">
            {compact ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => handleOpen(true)}
                aria-label="选择素材"
                title="选择素材"
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => handleOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                选择素材
              </Button>
            )}
            {!compact && selected.length > 0 && (
              <span className="text-xs text-muted-foreground">已选 {selected.length} 项</span>
            )}
          </div>
          {compact ? (
            <div className="min-w-0 overflow-x-auto">{renderSelectedThumbnails()}</div>
          ) : renderSelectedThumbnails()}
        </div>
        <Dialog modal={false} open={isOpen} onOpenChange={handleOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>选择素材</DialogTitle>
              <DialogDescription>从素材库选择，或通过独立入口直接上传图片/视频</DialogDescription>
            </DialogHeader>
            {renderDialogBody()}
          </DialogContent>
        </Dialog>
        {renderPreviewModal()}
        <ImageEditorDialog
          open={editingMaterial !== null}
          onOpenChange={(open) => { if (!open) setEditingMaterial(null); }}
          imageUrl={editingMaterial?.url || ''}
          fileName={editingMaterial?.material.file_name || 'edited-image'}
          onSave={handleEditedImageSave}
        />
      </>
    );
  }

  return (
    <>
      <Dialog modal={false} open={isOpen} onOpenChange={handleOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>选择素材</DialogTitle>
            <DialogDescription>从素材库选择，或通过独立入口直接上传图片/视频</DialogDescription>
          </DialogHeader>
          {renderDialogBody()}
        </DialogContent>
      </Dialog>
      {renderPreviewModal()}
      <ImageEditorDialog
        open={editingMaterial !== null}
        onOpenChange={(open) => { if (!open) setEditingMaterial(null); }}
        imageUrl={editingMaterial?.url || ''}
        fileName={editingMaterial?.material.file_name || 'edited-image'}
        onSave={handleEditedImageSave}
      />
    </>
  );
}
