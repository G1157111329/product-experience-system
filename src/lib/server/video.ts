/**
 * Faststart remux for MP4/MOV videos.
 * Moves the moov atom from end of file to beginning so browsers can start
 * playback without seeking to the end of the file first.
 */

import { spawn } from "child_process";
import { rename, unlink } from "fs/promises";
import path from "path";

const FASTSTART_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"]);

function needsFaststart(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return FASTSTART_EXTENSIONS.has(ext);
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

    const ffmpeg = spawn("ffmpeg", [
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
