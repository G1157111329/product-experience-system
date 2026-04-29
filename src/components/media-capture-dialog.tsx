'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Square, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MediaCaptureDialogProps {
  mode: 'image' | 'video';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => Promise<void> | void;
  busy?: boolean;
}

export function MediaCaptureDialog({
  mode,
  open,
  onOpenChange,
  onCapture,
  busy = false,
}: MediaCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

  const stopStream = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      discardRecordingRef.current = true;
      try {
        recorder.stop();
      } catch {
        // Ignore recorder shutdown failures while closing.
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    setError('');
    setStarting(true);
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持直接拍摄，请使用相册上传');
      setStarting(false);
      return;
    }

    try {
      const video = { facingMode: { ideal: 'environment' } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: mode === 'video' });
      } catch (err) {
        if (mode !== 'video') throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setError('无法打开摄像头，请检查浏览器权限后重试');
    } finally {
      setStarting(false);
    }
  }, [mode, stopStream]);

  useEffect(() => {
    if (open) {
      startStream();
    } else {
      stopStream();
      setError('');
      setCapturing(false);
    }
    return () => stopStream();
  }, [open, startStream, stopStream]);

  const handleCaptureImage = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || capturing || busy) return;

    setCapturing(true);
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('capture failed'));
        }, 'image/jpeg', 0.92);
      });
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onCapture(file);
      onOpenChange(false);
    } catch {
      setError('拍照失败，请重试');
    } finally {
      setCapturing(false);
    }
  };

  const handleStartRecording = () => {
    const stream = streamRef.current;
    if (!stream || recording || capturing || busy) return;

    if (typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持直接录像，请使用相册视频上传');
      return;
    }

    try {
      chunksRef.current = [];
      discardRecordingRef.current = false;
      const mimeType = getSupportedVideoMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          chunksRef.current = [];
          setRecording(false);
          return;
        }
        setCapturing(true);
        try {
          const type = recorder.mimeType || mimeType || 'video/webm';
          const blob = new Blob(chunksRef.current, { type });
          const extension = type.includes('mp4') ? 'mp4' : 'webm';
          const file = new File([blob], `video-${Date.now()}.${extension}`, { type });
          await onCapture(file);
          onOpenChange(false);
        } catch {
          setError('录像保存失败，请重试');
        } finally {
          chunksRef.current = [];
          setCapturing(false);
          setRecording(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError('录像启动失败，请使用相册视频上传');
    }
  };

  const handleStopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      discardRecordingRef.current = false;
      recorderRef.current.stop();
    }
  };

  const title = mode === 'image' ? '拍照' : '录像';
  const description = mode === 'image' ? '对准素材后点击拍照上传' : '点击开始录像，再点击停止并上传';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-4 space-y-3">
          <div className="relative aspect-[3/4] sm:aspect-video overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            {(starting || capturing || busy) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {starting ? '正在打开摄像头...' : '正在处理...'}
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white">
                {error}
              </div>
            )}
          </div>
          {error ? (
            <Button type="button" variant="outline" className="w-full" onClick={startStream} disabled={starting}>
              重试
            </Button>
          ) : mode === 'image' ? (
            <Button type="button" className="w-full" onClick={handleCaptureImage} disabled={starting || capturing || busy}>
              {capturing || busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Camera className="h-4 w-4 mr-1.5" />}
              拍照上传
            </Button>
          ) : recording ? (
            <Button type="button" variant="destructive" className="w-full" onClick={handleStopRecording} disabled={capturing || busy}>
              <Square className="h-4 w-4 mr-1.5" />
              停止并上传
            </Button>
          ) : (
            <Button type="button" className="w-full" onClick={handleStartRecording} disabled={starting || capturing || busy}>
              {capturing || busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Video className="h-4 w-4 mr-1.5" />}
              开始录像
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSupportedVideoMimeType() {
  const candidates = [
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}
