'use client';

import { useEffect, useState, useRef } from 'react';
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
}

interface MaterialPickerProps {
  taskId: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[], materials: Material[]) => void;
  maxSelect?: number;
}

export function MaterialPicker({ taskId, selectedIds, onSelectionChange, maxSelect = 9 }: MaterialPickerProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/materials?task_id=${taskId}`)
      .then(r => r.json())
      .then(res => {
        if (res.code === 0) setMaterials((res.data || []).filter((m: Material) => m.material_type === 'image'));
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 100 * 1024 * 1024) continue;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('task_id', taskId);
      try {
        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code === 0) {
          const newMat = data.data as Material;
          if (newMat.material_type === 'image') {
            setMaterials(prev => [newMat, ...prev]);
          }
        }
      } catch { /* ignore */ }
    }
  };

  const toggleSelect = (mat: Material) => {
    if (selectedIds.includes(mat.id)) {
      const newIds = selectedIds.filter(id => id !== mat.id);
      const newMats = materials.filter(m => newIds.includes(m.id));
      onSelectionChange(newIds, newMats);
    } else if (selectedIds.length < maxSelect) {
      const newIds = [...selectedIds, mat.id];
      const newMats = materials.filter(m => newIds.includes(m.id));
      onSelectionChange(newIds, newMats);
    }
  };

  const images = materials;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          引用素材图片 {selectedIds.length > 0 && `(${selectedIds.length}/${maxSelect})`}
        </span>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => fileInputRef.current?.click()}>
          <Camera className="h-3 w-3 mr-1" /> 上传新图片
        </Button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />

      {loading ? (
        <div className="grid grid-cols-4 gap-1.5">{[1,2,3,4].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded" />)}</div>
      ) : images.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
          暂无图片素材，请先上传
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
          {images.map((mat) => {
            const isSelected = selectedIds.includes(mat.id);
            return (
              <div
                key={mat.id}
                className={cn(
                  'relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition-all',
                  isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'
                )}
                onClick={() => toggleSelect(mat)}
              >
                <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preview selected thumbnails */}
      {selectedIds.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {selectedIds.map(id => {
            const mat = materials.find(m => m.id === id);
            if (!mat) return null;
            return (
              <div key={id} className="relative w-12 h-12 rounded-md overflow-hidden border border-border">
                <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                <button
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(mat); }}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
