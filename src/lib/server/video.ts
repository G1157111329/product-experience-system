/**
 * Faststart remux for MP4/MOV videos.
 * Moves the moov atom from end of file to beginning so browsers can start
 * playback without seeking to the end of the file first.
 */

import { spawn } from "child_process";
import { rename, unlink } from "fs/promises";
import path from "path";

const FASTSTART_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"]);
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

type VideoStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
};

type ProbeResult = { streams?: VideoStream[] };

function needsFaststart(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return FASTSTART_EXTENSIONS.has(ext);
}

export function browserVideoFileName(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return extension !== '.mp4'
    ? `${filePath.slice(0, -extension.length)}.mp4`
    : filePath;
}

export function needsBrowserVideoTranscode(probe: ProbeResult): boolean {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video || video.codec_name !== 'h264') return true;
  if (video.pix_fmt && !/^yuvj?420p$/i.test(video.pix_fmt)) return true;
  return Boolean(audio && audio.codec_name !== 'aac');
}

function runProcess(command: string, args: string[], timeout = 180_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      stderr += error.message;
      resolve({ code: -1, stdout, stderr });
    });
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function probeVideo(filePath: string): Promise<ProbeResult | null> {
  const result = await runProcess(FFMPEG_BIN, ['-hide_banner', '-i', filePath], 30_000);
  const probe = parseVideoStreamsFromFfmpegOutput(result.stderr);
  return probe.streams?.length ? probe : null;
}

export function parseVideoStreamsFromFfmpegOutput(output: string): ProbeResult {
  const streams: VideoStream[] = [];
  for (const line of output.split(/\r?\n/)) {
    const video = line.match(/\bVideo:\s*([^\s,(]+)[^,]*(?:,\s*([^,\s]+))?/i);
    if (video) {
      streams.push({ codec_type: 'video', codec_name: video[1].toLowerCase(), pix_fmt: video[2]?.toLowerCase() });
      continue;
    }
    const audio = line.match(/\bAudio:\s*([^\s,(]+)/i);
    if (audio) streams.push({ codec_type: 'audio', codec_name: audio[1].toLowerCase() });
  }
  return { streams };
}

/**
 * Normalize phone videos into the browser baseline (MP4/H.264/AAC) before the
 * database row is created. Compatible streams are copied; other codecs are
 * transcoded only when required.
 */
export async function prepareVideoForBrowser(filePath: string): Promise<string> {
  const targetPath = browserVideoFileName(filePath);
  const tempPath = path.join(
    path.dirname(targetPath),
    `.browser-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );
  const probe = await probeVideo(filePath);
  const transcode = !probe || needsBrowserVideoTranscode(probe);
  const args = transcode
    ? [
        '-y', '-i', filePath, '-map_metadata', '0',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tempPath,
      ]
    : ['-y', '-i', filePath, '-map_metadata', '0', '-c', 'copy', '-movflags', '+faststart', tempPath];
  const result = await runProcess(FFMPEG_BIN, args);
  if (result.code !== 0) {
    await unlink(tempPath).catch(() => undefined);
    console.warn(`[video] browser preparation failed (exit ${result.code}):`, result.stderr.slice(-500));
    return filePath;
  }

  try {
    await rename(tempPath, targetPath);
    if (targetPath !== filePath) await unlink(filePath).catch(() => undefined);
    console.log(`[video] browser-ready ${transcode ? 'transcode' : 'remux'} complete:`, targetPath);
    return targetPath;
  } catch (error) {
    console.warn('[video] browser preparation rename failed:', error);
    await unlink(tempPath).catch(() => undefined);
    return filePath;
  }
}

/**
 * Run ffmpeg to remux a video file with moov atom at the front (faststart).
 * Writes to a temp file first, then atomically renames over the original.
 * Returns true on success, false if ffmpeg is unavailable or processing fails.
 */
export async function faststartRemux(filePath: string): Promise<boolean> {
  if (!needsFaststart(filePath)) return true; // not a video, skip silently

  return new Promise((resolve) => {
    // Temp file MUST live on the same filesystem as the target so the final
    // rename is an atomic, same-device operation. Using os.tmpdir() (/tmp) breaks
    // when uploads are on a separate data disk (EXDEV cross-device rename),
    // e.g. after migrating public/uploads to a dedicated volume.
    const tmpPath = path.join(
      path.dirname(filePath),
      `.faststart-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(filePath)}`
    );

    const ffmpeg = spawn(FFMPEG_BIN, [
      "-y",
      "-i", filePath,
      "-c", "copy",
      "-movflags", "+faststart",
      tmpPath,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (err) => {
      console.warn("[video] ffmpeg not available, skipping faststart:", err.message);
      unlink(tmpPath).catch(() => {});
      resolve(false);
    });

    ffmpeg.on("close", async (code) => {
      if (code !== 0) {
        console.warn(`[video] ffmpeg faststart failed (exit ${code}):`, stderr.slice(-500));
        await unlink(tmpPath).catch(() => {});
        resolve(false);
        return;
      }

      try {
        await rename(tmpPath, filePath);
        console.log("[video] faststart remux complete:", filePath);
        resolve(true);
      } catch (renameErr) {
        console.warn("[video] faststart rename failed:", renameErr);
        await unlink(tmpPath).catch(() => {});
        resolve(false);
      }
    });
  });
}
