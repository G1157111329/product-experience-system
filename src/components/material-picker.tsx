'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Loader2, Film, Image as ImageIcon, Camera, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaThumbnail } from './image-preview';
import { MediaCaptureDialog } from './media-capture-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
}

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
  selectedIds?: string[];
  initialMaterials?: Material[];
  onSelectionChange?: (ids: string[], materials: Material[]) => void;
  onPreview?: (url: string) => void;
  selectedPreviewSize?: 'sm' | 'md';
}

type FilterType = 'all' | 'image' | 'video';

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
  selectedIds,
  initialMaterials,
  onSelectionChange,
  onPreview,
  selectedPreviewSize = 'sm',
}: MaterialPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
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

      if (onSelect && !onSelectionChange) {
        list = list.filter((material) => {
          if (recordId && material.record_id === recordId) return true;
          if (recipeStepId && material.recipe_step_id === recipeStepId) return true;
          if (recipeId && material.recipe_id === recipeId) return true;
          if (issueId && material.issue_id === issueId) return true;
          return !material.record_id && !material.recipe_step_id && !material.recipe_id && !material.issue_id;
        });
      }

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

  const handleOpen = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (nextOpen) fetchMaterials();
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

  const resetFileInputs = () => {
    [
      galleryImageInputRef,
      galleryVideoInputRef,
    ].forEach((inputRef) => {
      if (inputRef.current) inputRef.current.value = '';
    });
  };

  const triggerFilePicker = (inputRef: React.RefObject<HTMLInputElement | null>) => {
    const input = inputRef.current;
    if (!input || uploading) return;
    input.click();
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      let nextSelected = [...selected];
      const nextMaterials = materials.filter((material) => nextSelected.includes(material.id));
      let uploadedCount = 0;

      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} 超过100MB`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        if (recordId) formData.append('record_id', recordId);
        if (recipeStepId) formData.append('recipe_step_id', recipeStepId);
        if (recipeId) formData.append('recipe_id', recipeId);
        if (issueId) formData.append('issue_id', issueId);
        if (reEvaluationId) formData.append('re_evaluation_id', reEvaluationId);

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

      if (uploadedCount > 0) toast.success('上传成功');
    } finally {
      setUploading(false);
      resetFileInputs();
    }
  };

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
      notifySelectionChange(nextSelected, materials.filter((item) => nextSelected.includes(item.id)));
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
      notifySelectionChange(nextSelected, materials.filter((item) => nextSelected.includes(item.id)));
    }
  };

  const filteredMaterials = filterType === 'all'
    ? materials
    : materials.filter((material) => material.material_type === filterType);

  const renderSelectedThumbnails = () => {
    if (selected.length === 0) return null;

    const wrapperClass = selectedPreviewSize === 'md' ? 'w-20 h-20' : 'w-12 h-12';

    return (
      <div className={cn('flex flex-wrap', selectedPreviewSize === 'md' ? 'gap-2.5' : 'gap-1.5')}>
        {selected.map((id) => {
          const material = selectedMaterialMap[id];
          if (!material) return null;

          return (
            <div key={id} className={cn('relative rounded-md overflow-hidden border border-border group cursor-pointer', wrapperClass)}
              onClick={(e) => {
                e.stopPropagation();
                if (onPreview) {
                  onPreview(material.file_url);
                } else {
                  setPreviewUrl(material.file_url);
                }
              }}>
              <MediaThumbnail url={material.file_path || material.file_url} type={material.material_type as 'image' | 'video'} size={selectedPreviewSize} />
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
    if (!previewUrl) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
        onClick={() => setPreviewUrl(null)}>
        <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
          {previewUrl.match(/\.(mp4|webm|mov)/i) || previewUrl.includes('video') ? (
            <video src={previewUrl} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
          ) : (
            <img src={previewUrl} alt="预览" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          )}
          <button type="button" className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 text-gray-800 flex items-center justify-center text-lg font-bold shadow-lg hover:bg-white"
            onClick={() => setPreviewUrl(null)}>×</button>
        </div>
      </div>
    );
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
    <div className="space-y-3">
      {renderUploadActions()}
      <ScrollArea className="h-[50vh]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">暂无素材，请先上传</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {filteredMaterials.map((material) => (
              <div key={material.id} className="relative cursor-pointer" onClick={() => handleSelect(material)}>
                <MediaThumbnail url={material.file_url} type={material.material_type as 'image' | 'video'} responsive />
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
      </ScrollArea>
    </div>
  );

  if (controlledOpen === undefined && onOpenChange === undefined) {
    return (
      <>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => handleOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              选择素材
            </Button>
            {selected.length > 0 && (
              <span className="text-xs text-muted-foreground">已选 {selected.length} 项</span>
            )}
          </div>
          {renderSelectedThumbnails()}
        </div>
        <Dialog modal={false} open={isOpen} onOpenChange={handleOpen}>
          <DialogContent className="max-w-lg max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>选择素材</DialogTitle>
              <DialogDescription>从素材库选择，或通过独立入口直接上传图片/视频</DialogDescription>
            </DialogHeader>
            {renderDialogBody()}
          </DialogContent>
        </Dialog>
        {renderPreviewModal()}
      </>
    );
  }

  return (
    <>
      <Dialog modal={false} open={isOpen} onOpenChange={handleOpen}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>选择素材</DialogTitle>
            <DialogDescription>从素材库选择，或通过独立入口直接上传图片/视频</DialogDescription>
          </DialogHeader>
          {renderDialogBody()}
        </DialogContent>
      </Dialog>
      {renderPreviewModal()}
    </>
  );
}
