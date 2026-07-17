'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Camera, Video, Film, Image as ImageIcon, Pencil, Trash2, Check, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useImagePreview } from '@/components/image-preview';
import { MediaCaptureDialog } from '@/components/media-capture-dialog';
import { usePresignedUrls } from '@/lib/use-presigned-url';
import type { Material } from '../types';

export function MaterialsTab({ taskId }: { taskId: string }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [captureMode, setCaptureMode] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement>(null);
  const { open, PreviewComponent } = useImagePreview();
  const presignedUrls = usePresignedUrls(materials);

  const fetchMaterials = useCallback(async () => {
    const res = await fetch(`/api/materials?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) setMaterials(data.data || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const handleUpload = async (files: File[] | FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        if (file.size > 100 * 1024 * 1024) { toast.error(`${file.name} 超过100MB`); continue; }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', taskId);
        toast.loading(`正在上传 ${file.name}...`, { id: `upload-${file.name}` });
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000);
          const res = await fetch('/api/materials/upload', { method: 'POST', body: formData, signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (data.code === 0) toast.success(`${file.name} 上传成功`, { id: `upload-${file.name}` });
          else toast.error(data.message, { id: `upload-${file.name}` });
        } catch (err) {
          const msg = err instanceof DOMException && err.name === 'AbortError' ? '上传超时，请重试' : '上传失败';
          toast.error(msg, { id: `upload-${file.name}` });
        }
      }
      fetchMaterials();
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (id: string) => {
    const res = await fetch('/api/materials', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, file_name: editName }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('重命名成功');
      setEditingId(null);
      fetchMaterials();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/materials?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { toast.success('已删除'); fetchMaterials(); }
  };

  const images = materials.filter(m => m.material_type === 'image');
  const videos = materials.filter(m => m.material_type === 'video');

  return (
    <div className="space-y-4">
      <PreviewComponent />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="outline" size="sm" className="justify-center" onClick={() => setCaptureMode('image')} disabled={uploading}>
          <Camera className="h-4 w-4 mr-1.5" /> 拍照
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => setCaptureMode('video')} disabled={uploading}>
          <Video className="h-4 w-4 mr-1.5" /> 录像
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => galleryImageInputRef.current?.click()} disabled={uploading}>
          <ImageIcon className="h-4 w-4 mr-1.5" /> 相册图片
        </Button>
        <Button variant="outline" size="sm" className="justify-center" onClick={() => galleryVideoInputRef.current?.click()} disabled={uploading}>
          <Film className="h-4 w-4 mr-1.5" /> 相册视频
        </Button>
      </div>
      <input ref={galleryImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { await handleUpload(e.target.files); e.target.value = ''; }} />
      <input ref={galleryVideoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={async (e) => { await handleUpload(e.target.files); e.target.value = ''; }} />
      <MediaCaptureDialog
        mode={captureMode || 'image'}
        open={captureMode !== null}
        onOpenChange={(open) => setCaptureMode(open ? (captureMode || 'image') : null)}
        onCapture={(file) => handleUpload([file])}
        busy={uploading}
      />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[1,2,3].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />)}</div>
      ) : materials.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">素材仓库为空</p>
          <p className="text-xs text-muted-foreground mt-1">上传图片或视频开始使用</p>
        </CardContent></Card>
      ) : (
        <>
          {images.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">图片 ({images.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {images.map((mat) => (
                  <div key={mat.id} className="group relative rounded-lg overflow-hidden bg-muted border border-border">
                    <div className="aspect-square cursor-pointer" onClick={() => open(presignedUrls.get(mat.id) || mat.file_url)}>
                      <img src={presignedUrls.get(mat.id) || mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input className="h-6 text-xs bg-white/90 border-0" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)} autoFocus />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-white truncate flex-1">{mat.file_name}</p>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }} className="p-0.5 text-white/70 hover:text-white">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDelete(mat.id)} className="p-0.5 text-white/70 hover:text-white">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {videos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">视频 ({videos.length})</p>
              <div className="space-y-2">
                {videos.map((mat) => (
                  <div key={mat.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border group">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input className="h-6 text-xs" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)} autoFocus />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm truncate">{mat.file_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{(mat.file_size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(mat.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
