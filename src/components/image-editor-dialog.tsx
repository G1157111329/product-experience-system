'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowUpRight, RotateCw, RotateCcw, Crop, Pencil, Type, Grid3x3,
  Check, Undo2, Move, Minus
} from 'lucide-react';

type Tool = 'move' | 'crop' | 'draw' | 'arrow' | 'mosaic' | 'text';

interface DrawPoint { x: number; y: number; }
interface DrawAction {
  type: 'draw' | 'arrow' | 'mosaic' | 'text';
  points?: DrawPoint[];
  color?: string;
  width?: number;
  start?: DrawPoint;
  end?: DrawPoint;
  mosaicRects?: { x: number; y: number; w: number; h: number; pixels: number[][] }[];
  text?: string;
  textPos?: DrawPoint;
  fontSize?: number;
}

interface ImageEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onSave: (editedFile: File) => Promise<void> | void;
  fileName?: string;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000', '#ffffff'];

function renderAction(ctx: CanvasRenderingContext2D, action: DrawAction, scale: number) {
  ctx.save();
  if (action.type === 'draw' && action.points && action.points.length > 1) {
    ctx.strokeStyle = action.color || '#ef4444';
    ctx.lineWidth = (action.width || 3) * scale;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(action.points[0].x * scale, action.points[0].y * scale);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x * scale, action.points[i].y * scale);
    }
    ctx.stroke();
  } else if (action.type === 'arrow' && action.start && action.end) {
    drawArrow(ctx, action.start.x * scale, action.start.y * scale, action.end.x * scale, action.end.y * scale, (action.color || '#ef4444'), (action.width || 3) * scale);
  } else if (action.type === 'mosaic' && action.mosaicRects) {
    for (const rect of action.mosaicRects) {
      const [r, g, b] = rect.pixels[0];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale);
    }
  } else if (action.type === 'text' && action.text && action.textPos) {
    ctx.fillStyle = action.color || '#ef4444';
    ctx.font = `bold ${(action.fontSize || 20) * scale}px sans-serif`;
    ctx.textBaseline = 'top';
    // Text shadow for readability
    ctx.shadowColor = action.color === '#ffffff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 3 * scale;
    ctx.fillText(action.text, action.textPos.x * scale, action.textPos.y * scale);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, width: number) {
  const headLen = Math.max(width * 4, 12);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

export function ImageEditorDialog({
  open, onOpenChange, imageUrl, onSave, fileName = 'edited-image',
}: ImageEditorDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const [tool, setTool] = useState<Tool>('move');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<DrawPoint | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropStart, setCropStart] = useState<DrawPoint | null>(null);
  const scaleRef = useRef(1);

  // Load image
  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImgSize({ w: img.width, h: img.height });
      setRotation(0);
      setActions([]);
      setCropRect(null);
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  // Calculate display size
  useEffect(() => {
    if (!imgSize.w || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight || 500;
    const isRotated = rotation % 180 !== 0;
    const iw = isRotated ? imgSize.h : imgSize.w;
    const ih = isRotated ? imgSize.w : imgSize.h;
    const s = Math.min(cw / iw, ch / ih, 1);
    scaleRef.current = s;
    setDisplaySize({ w: Math.round(iw * s), h: Math.round(ih * s) });
  }, [imgSize, rotation]);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const isRotated = rotation % 180 !== 0;
    const dw = isRotated ? imgSize.h : imgSize.w;
    const dh = isRotated ? imgSize.w : imgSize.h;
    const s = scaleRef.current;
    canvas.width = Math.round(dw * s);
    canvas.height = Math.round(dh * s);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const drawW = (isRotated ? imgSize.h : imgSize.w) * s;
    const drawH = (isRotated ? imgSize.w : imgSize.h) * s;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Draw all committed actions
    const allActions = currentAction ? [...actions, currentAction] : actions;
    for (const action of allActions) {
      renderAction(ctx, action, s);
    }

    // Draw crop overlay
    if (tool === 'crop' && cropRect) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(cropRect.x * s, cropRect.y * s, cropRect.w * s, cropRect.h * s);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cropRect.x * s, cropRect.y * s, cropRect.w * s, cropRect.h * s);
      ctx.setLineDash([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, imgSize, actions, currentAction, tool, cropRect]);

  useEffect(() => { redraw(); }, [redraw]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): DrawPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const s = scaleRef.current;
    return { x: (clientX - rect.left) / s, y: (clientY - rect.top) / s };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'move') return;
    const pos = getCanvasPos(e);

    if (tool === 'text') {
      setTextPos(pos);
      setShowTextInput(true);
      setTextInput('');
      return;
    }

    setIsDrawing(true);
    if (tool === 'crop') {
      setCropStart(pos);
      setCropRect(null);
    } else if (tool === 'draw') {
      setCurrentAction({ type: 'draw', points: [pos], color, width: lineWidth });
    } else if (tool === 'arrow') {
      setCurrentAction({ type: 'arrow', start: pos, end: pos, color, width: lineWidth });
    } else if (tool === 'mosaic') {
      setCurrentAction({ type: 'mosaic', start: pos, end: pos });
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);

    if (tool === 'crop' && cropStart) {
      setCropRect({
        x: Math.min(cropStart.x, pos.x), y: Math.min(cropStart.y, pos.y),
        w: Math.abs(pos.x - cropStart.x), h: Math.abs(pos.y - cropStart.y),
      });
    } else if (tool === 'draw' && currentAction?.type === 'draw') {
      setCurrentAction(prev => prev ? { ...prev, points: [...(prev.points || []), pos] } : null);
    } else if (tool === 'arrow' && currentAction?.type === 'arrow') {
      setCurrentAction(prev => prev ? { ...prev, end: pos } : null);
    } else if (tool === 'mosaic' && currentAction?.type === 'mosaic') {
      setCurrentAction(prev => prev ? { ...prev, end: pos } : null);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing && tool !== 'text') return;
    setIsDrawing(false);

    if (tool === 'crop') {
      // Crop rect is already set
    } else if (currentAction) {
      // For mosaic, compute pixel blocks
      if (currentAction.type === 'mosaic' && currentAction.start && currentAction.end) {
        const mosaicRects = computeMosaic(currentAction.start, currentAction.end, 12);
        setActions(prev => [...prev, { ...currentAction, mosaicRects }]);
      } else {
        setActions(prev => [...prev, currentAction]);
      }
      setCurrentAction(null);
    }
  };

  const computeMosaic = (start: DrawPoint, end: DrawPoint, blockSize: number) => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return [];
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const s = scaleRef.current;
    const sx = Math.min(start.x, end.x);
    const sy = Math.min(start.y, end.y);
    const sw = Math.abs(end.x - start.x);
    const sh = Math.abs(end.y - start.y);
    if (sw < 2 || sh < 2) return [];

    // Read pixels from canvas (already rendered image)
    const imgData = ctx.getImageData(Math.round(sx * s), Math.round(sy * s), Math.round(sw * s), Math.round(sh * s));
    const rects: { x: number; y: number; w: number; h: number; pixels: number[][] }[] = [];
    const bs = Math.max(Math.round(blockSize), 4);

    for (let by = 0; by < imgData.height; by += bs) {
      for (let bx = 0; bx < imgData.width; bx += bs) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < bs && by + dy < imgData.height; dy++) {
          for (let dx = 0; dx < bs && bx + dx < imgData.width; dx++) {
            const idx = ((by + dy) * imgData.width + (bx + dx)) * 4;
            r += imgData.data[idx]; g += imgData.data[idx + 1]; b += imgData.data[idx + 2]; count++;
          }
        }
        if (count > 0) {
          rects.push({
            x: sx + bx / s, y: sy + by / s, w: bs / s, h: bs / s,
            pixels: [[Math.round(r / count), Math.round(g / count), Math.round(b / count)]],
          });
        }
      }
    }
    return rects;
  };

  const confirmText = () => {
    if (textPos && textInput.trim()) {
      setActions(prev => [...prev, {
        type: 'text', text: textInput, textPos, color, fontSize: Math.round(20 / scaleRef.current),
      }]);
    }
    setShowTextInput(false);
    setTextInput('');
    setTextPos(null);
  };

  const handleUndo = () => {
    setActions(prev => prev.slice(0, -1));
  };

  const handleRotate = (deg: number) => {
    setRotation(prev => (prev + deg + 360) % 360);
  };

  const applyCrop = async () => {
    if (!cropRect || !imageRef.current) return;
    const { x, y, w, h } = cropRect;
    if (w < 5 || h < 5) return;
    const img = imageRef.current;
    const isRotated = rotation % 180 !== 0;
    // Create a temp canvas with the current full image (rotated)
    const tempCanvas = document.createElement('canvas');
    const dw = isRotated ? imgSize.h : imgSize.w;
    const dh = isRotated ? imgSize.w : imgSize.h;
    tempCanvas.width = dw; tempCanvas.height = dh;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.translate(dw / 2, dh / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    const drawW = isRotated ? imgSize.h : imgSize.w;
    const drawH = isRotated ? imgSize.w : imgSize.h;
    tempCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    tempCtx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw all actions on top at full resolution
    for (const action of actions) {
      renderAction(tempCtx, action, 1);
    }

    // Crop from full-resolution canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = Math.round(w); cropCanvas.height = Math.round(h);
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(tempCanvas, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, cropCanvas.width, cropCanvas.height);

    // Convert back to image and reset
    const url = cropCanvas.toDataURL('image/jpeg', 0.92);
    const newImg = new Image();
    newImg.crossOrigin = 'anonymous';
    newImg.onload = () => {
      imageRef.current = newImg;
      setImgSize({ w: newImg.width, h: newImg.height });
      setRotation(0);
      setActions([]);
      setCropRect(null);
      setTool('move');
    };
    newImg.src = url;
  };

  const handleSave = async () => {
    if (!imageRef.current) return;
    setSaving(true);
    try {
      const img = imageRef.current;
      const isRotated = rotation % 180 !== 0;
      const dw = isRotated ? imgSize.h : imgSize.w;
      const dh = isRotated ? imgSize.w : imgSize.h;
      const canvas = document.createElement('canvas');
      canvas.width = dw; canvas.height = dh;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(dw / 2, dh / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      const drawW = isRotated ? imgSize.h : imgSize.w;
      const drawH = isRotated ? imgSize.w : imgSize.h;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const action of actions) {
        renderAction(ctx, action, 1);
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.92);
      });
      const file = new File([blob], `${fileName}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onSave(file);
      onOpenChange(false);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const cursorMap: Record<Tool, string> = {
    move: 'default', crop: 'crosshair', draw: 'crosshair',
    arrow: 'crosshair', mosaic: 'crosshair', text: 'text',
  };

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'move', icon: <Move className="h-4 w-4" />, label: '移动' },
    { id: 'crop', icon: <Crop className="h-4 w-4" />, label: '裁剪' },
    { id: 'draw', icon: <Pencil className="h-4 w-4" />, label: '画笔' },
    { id: 'arrow', icon: <ArrowUpRight className="h-4 w-4" />, label: '箭头' },
    { id: 'mosaic', icon: <Grid3x3 className="h-4 w-4" />, label: '马赛克' },
    { id: 'text', icon: <Type className="h-4 w-4" />, label: '文字' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">编辑图片</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-1 flex-wrap">
            {tools.map(t => (
              <Button key={t.id} variant={tool === t.id ? 'default' : 'ghost'} size="sm"
                className="h-8 px-2 text-xs gap-1" onClick={() => { setTool(t.id); setCropRect(null); }}>
                {t.icon} <span className="hidden sm:inline">{t.label}</span>
              </Button>
            ))}
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleRotate(-90)}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleRotate(90)}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleUndo} disabled={actions.length === 0}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Color & Width (for draw/arrow/text) */}
          {(tool === 'draw' || tool === 'arrow' || tool === 'text') && (
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                  style={{ backgroundColor: c }} onClick={() => setColor(c)} />
              ))}
              {(tool === 'draw' || tool === 'arrow') && (
                <div className="flex items-center gap-1 ml-2">
                  <Minus className="h-3 w-3 text-muted-foreground" />
                  <input type="range" min={1} max={10} step={1} value={lineWidth}
                    onChange={e => setLineWidth(Number(e.target.value))} className="w-16 h-1 accent-primary" />
                  <span className="text-[10px] text-muted-foreground w-4">{lineWidth}</span>
                </div>
              )}
            </div>
          )}

          {/* Canvas */}
          <div ref={containerRef} className="relative bg-muted rounded-lg overflow-hidden" style={{ height: 420 }}>
            <canvas ref={canvasRef} style={{ width: displaySize.w, height: displaySize.h, cursor: cursorMap[tool] }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
              onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
            />
          </div>

          {/* Crop confirm */}
          {tool === 'crop' && cropRect && cropRect.w > 5 && cropRect.h > 5 && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={applyCrop}>
                <Crop className="h-3.5 w-3.5 mr-1" /> 确认裁剪
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCropRect(null)}>取消</Button>
            </div>
          )}

          {/* Text input */}
          {showTextInput && textPos && (
            <div className="flex gap-2 items-center">
              <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmText()}
                placeholder="输入文字..." autoFocus
                className="flex-1 h-8 px-2 text-sm border rounded-md bg-background" />
              <Button size="sm" onClick={confirmText}>确认</Button>
              <Button variant="outline" size="sm" onClick={() => { setShowTextInput(false); setTextPos(null); }}>取消</Button>
            </div>
          )}

          {/* Save */}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              <Check className="h-4 w-4 mr-1" /> {saving ? '保存中...' : '保存修改'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
