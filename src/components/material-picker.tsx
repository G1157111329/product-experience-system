'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Loader2, Film, Image as ImageIcon, Camera, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaThumbnail } from './image-preview';
import { toast } from 'sonner';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string;
  file_size: number; record_id: string | null; recipe_step_id: string | null;
  recipe_id: string | null;
}

interface MaterialPickerProps {
  taskId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (material: Material) => void;
  recordId?: string;
  recipeStepId?: string;
  recipeId?: string;
  // Legacy API (used by tasks/[id])
  selectedIds?: string[];
  initialMaterials?: Material[];
  onSelectionChange?: (ids: string[], materials: Material[]) => void;
}

export function MaterialPicker({ taskId, open: controlledOpen, onOpenChange, onSelect, recordId, recipeStepId, recipeId, selectedIds, initialMaterials, onSelectionChange }: MaterialPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [selected, setSelected] = useState<string[]>(selectedIds || []);
  // Track selected material objects so thumbnails can show even when dialog hasn't been opened
  const [selectedMaterialMap, setSelectedMaterialMap] = useState<Record<string, Material>>(() => {
    const map: Record<string, Material> = {};
    if (initialMaterials) {
      for (const m of initialMaterials) map[m.id] = m;
    }
    return map;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  // Sync selected with external prop
  useEffect(() => {
    if (selectedIds) setSelected(selectedIds);
  }, [selectedIds]);

  // When onSelectionChange provides materials, update our local map so thumbnails work
  const notifySelectionChange = useCallback((newSelected: string[], newMats: Material[]) => {
    setSelectedMaterialMap(prev => {
      const updated = { ...prev };
      // Add all materials from the callback
      for (const m of newMats) {
        updated[m.id] = m;
      }
      // Remove deselected materials from map only if they were previously tracked
      // (keep them in case they're re-selected later - the map is just a cache)
      return updated;
    });
    onSelectionChange?.(newSelected, newMats);
  }, [onSelectionChange]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ task_id: taskId, limit: '200' });
      const res = await fetch(`/api/materials?${params}`);
      const data = await res.json();
      if (data.code === 0) {
        let list: Material[] = Array.isArray(data.data) ? data.data : (data.data?.list || []);
        // For single-select mode (onSelect), filter unassociated
        if (onSelect && !onSelectionChange) {
          list = list.filter(m => {
            if (recordId && m.record_id === recordId) return true;
            if (recipeStepId && m.recipe_step_id === recipeStepId) return true;
            if (recipeId && m.recipe_id === recipeId) return true;
            return !m.record_id && !m.recipe_step_id && !m.recipe_id;
          });
        }
        setMaterials(list);
        // Update selectedMaterialMap with fetched materials
        setSelectedMaterialMap(prev => {
          const updated = { ...prev };
          for (const m of list) {
            if (selected.includes(m.id) || selectedIds?.includes(m.id)) {
              updated[m.id] = m;
            }
          }
          return updated;
        });
      }
    } finally { setLoading(false); }
  }, [taskId, recordId, recipeStepId, onSelect, onSelectionChange, selected, selectedIds]);

  const handleOpen = (v: boolean) => {
    setIsOpen(v);
    if (v) fetchMaterials();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        if (recordId) formData.append('record_id', recordId);
        if (recipeStepId) formData.append('recipe_step_id', recipeStepId);
        if (recipeId) formData.append('recipe_id', recipeId);
        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code !== 0) { toast.error(data.message); return; }
        const newMat = data.data as Material;
        // Add to materials list
        setMaterials(prev => [...prev, newMat]);
        // Add to selectedMaterialMap for thumbnail display
        setSelectedMaterialMap(prev => ({ ...prev, [newMat.id]: newMat }));
        if (onSelect && !onSelectionChange) {
          onSelect(newMat);
        } else if (onSelectionChange) {
          const newSelected = [...selected, newMat.id];
          setSelected(newSelected);
          const newMats = materials.filter(m => newSelected.includes(m.id));
          newMats.push(newMat);
          notifySelectionChange(newSelected, newMats);
        }
      }
      toast.success('上传成功');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSelect = (m: Material) => {
    // Track material in map for thumbnail display
    setSelectedMaterialMap(prev => ({ ...prev, [m.id]: m }));

    if (onSelect && !onSelectionChange) {
      // Single select mode
      onSelect(m);
      setIsOpen(false);
    } else {
      // Multi-select mode
      const newSelected = selected.includes(m.id) ? selected.filter(x => x !== m.id) : [...selected, m.id];
      setSelected(newSelected);
      if (onSelectionChange) {
        notifySelectionChange(newSelected, materials.filter(mat => newSelected.includes(mat.id)));
      }
    }
  };

  const handleDeselect = (mId: string) => {
    const newSelected = selected.filter(x => x !== mId);
    setSelected(newSelected);
    // Remove from map if no longer selected
    setSelectedMaterialMap(prev => {
      const updated = { ...prev };
      delete updated[mId];
      return updated;
    });
    if (onSelectionChange) {
      notifySelectionChange(newSelected, materials.filter(mat => newSelected.includes(mat.id)));
    }
  };

  const filtered = filterType === 'all' ? materials : materials.filter(m => m.material_type === filterType);

  // Render selected thumbnails from the map (works even when dialog hasn't been opened)
  const renderSelectedThumbnails = () => {
    if (selected.length === 0) return null;
    return (
      <div className="flex gap-1.5 flex-wrap">
        {selected.map(id => {
          const m = selectedMaterialMap[id];
          if (!m) return null;
          return (
            <div key={id} className="relative w-12 h-12 rounded-md overflow-hidden border border-border group">
              <MediaThumbnail url={m.file_url} type={m.material_type as 'image' | 'video'} size="sm" />
              <button type="button" className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); handleDeselect(id); }}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // If no controlled open, render inline trigger button + dialog
  if (controlledOpen === undefined && onOpenChange === undefined) {
    return (
      <>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => handleOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> 选择素材
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
              <DialogDescription>从素材库选择或上传新的图片/视频</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {uploading ? '上传中...' : '上传图片'}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="absolute opacity-0 w-0 h-0 pointer-events-none" onChange={handleUpload} />
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => fileInputRef2.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                  {uploading ? '上传中...' : '上传视频'}
                </Button>
                <input ref={fileInputRef2} type="file" accept="video/*" capture="environment" className="absolute opacity-0 w-0 h-0 pointer-events-none" onChange={handleUpload} />
                <div className="flex gap-1 ml-auto">
                  {([['all', '全部'], ['image', '图片'], ['video', '视频']] as const).map(([val, label]) => (
                    <Button key={val} type="button" size="sm" variant={filterType === val ? 'default' : 'outline'} className="h-7 text-xs px-2"
                      onClick={() => setFilterType(val)}>{label}</Button>
                  ))}
                </div>
              </div>
              <ScrollArea className="h-[50vh]">
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">暂无素材，请先上传</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {filtered.map(m => (
                      <div key={m.id} className="relative cursor-pointer" onClick={() => handleSelect(m)}>
                        <MediaThumbnail url={m.file_url} type={m.material_type as 'image' | 'video'} size="lg" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate rounded-b-lg">
                          {m.material_type === 'video' ? <Film className="h-2.5 w-2.5 inline mr-0.5" /> : <ImageIcon className="h-2.5 w-2.5 inline mr-0.5" />}
                          {m.file_name}
                        </div>
                        {selected.includes(m.id) && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px]">✓</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Controlled mode (open/onOpenChange provided)
  return (
    <Dialog modal={false} open={isOpen} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>选择素材</DialogTitle>
          <DialogDescription>从素材库选择或上传新的图片/视频</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {uploading ? '上传中...' : '上传图片'}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => fileInputRef2.current?.click()} disabled={uploading}>
              <Film className="h-3.5 w-3.5" />
              上传视频
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="absolute opacity-0 w-0 h-0 pointer-events-none" onChange={handleUpload} />
            <input ref={fileInputRef2} type="file" accept="video/*" capture="environment" className="absolute opacity-0 w-0 h-0 pointer-events-none" onChange={handleUpload} />
            <div className="flex gap-1 ml-auto">
              {([['all', '全部'], ['image', '图片'], ['video', '视频']] as const).map(([val, label]) => (
                <Button key={val} size="sm" variant={filterType === val ? 'default' : 'outline'} className="h-7 text-xs px-2"
                  onClick={() => setFilterType(val)}>{label}</Button>
              ))}
            </div>
          </div>
          <ScrollArea className="h-[50vh]">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">暂无素材，请先上传</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filtered.map(m => (
                  <div key={m.id} className="relative cursor-pointer" onClick={() => handleSelect(m)}>
                    <MediaThumbnail url={m.file_url} type={m.material_type as 'image' | 'video'} size="lg" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate rounded-b-lg">
                      {m.material_type === 'video' ? <Film className="h-2.5 w-2.5 inline mr-0.5" /> : <ImageIcon className="h-2.5 w-2.5 inline mr-0.5" />}
                      {m.file_name}
                    </div>
                    {selected.includes(m.id) && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px]">✓</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
