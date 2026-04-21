'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Loader2, Film, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaThumbnail } from './image-preview';
import { toast } from 'sonner';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string;
  file_size: number; record_id: string | null; recipe_step_id: string | null;
}

interface MaterialPickerProps {
  taskId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (material: Material) => void;
  recordId?: string;
  recipeStepId?: string;
  // Legacy API (used by tasks/[id])
  selectedIds?: string[];
  onSelectionChange?: (ids: string[], materials: Material[]) => void;
}

export function MaterialPicker({ taskId, open: controlledOpen, onOpenChange, onSelect, recordId, recipeStepId, selectedIds, onSelectionChange }: MaterialPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [selected, setSelected] = useState<string[]>(selectedIds || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  // Sync selected with external prop
  useEffect(() => {
    if (selectedIds) setSelected(selectedIds);
  }, [selectedIds]);

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
            return !m.record_id && !m.recipe_step_id;
          });
        }
        setMaterials(list);
      }
    } finally { setLoading(false); }
  }, [taskId, recordId, recipeStepId, onSelect, onSelectionChange]);

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
        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code !== 0) { toast.error(data.message); return; }
        const newMat = data.data as Material;
        if (onSelect && !onSelectionChange) {
          onSelect(newMat);
        } else if (onSelectionChange) {
          const newSelected = [...selected, newMat.id];
          setSelected(newSelected);
          const newMats = materials.filter(m => newSelected.includes(m.id));
          newMats.push(newMat);
          onSelectionChange(newSelected, newMats);
        }
      }
      fetchMaterials();
      toast.success('上传成功');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSelect = (m: Material) => {
    if (onSelect && !onSelectionChange) {
      // Single select mode
      onSelect(m);
      setIsOpen(false);
    } else {
      // Multi-select mode
      const newSelected = selected.includes(m.id) ? selected.filter(x => x !== m.id) : [...selected, m.id];
      setSelected(newSelected);
      if (onSelectionChange) {
        onSelectionChange(newSelected, materials.filter(mat => newSelected.includes(mat.id)));
      }
    }
  };

  const filtered = filterType === 'all' ? materials : materials.filter(m => m.material_type === filterType);

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
          {selected.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {materials.filter(m => selected.includes(m.id)).map(m => (
                <div key={m.id} className="relative w-12 h-12 rounded-md overflow-hidden border border-border group">
                  <MediaThumbnail url={m.file_url} type={m.material_type as 'image' | 'video'} size="sm" />
                  <button type="button" className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleSelect(m); }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <Dialog open={isOpen} onOpenChange={handleOpen}>
          <DialogContent className="max-w-lg max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>选择素材</DialogTitle>
              <DialogDescription>从素材库选择或上传新的图片/视频</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {uploading ? '上传中...' : '上传素材'}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
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
      </>
    );
  }

  // Controlled mode (open/onOpenChange provided)
  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>选择素材</DialogTitle>
          <DialogDescription>从素材库选择或上传新的图片/视频</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {uploading ? '上传中...' : '上传素材'}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
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
