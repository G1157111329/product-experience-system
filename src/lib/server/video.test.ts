import assert from 'node:assert/strict';
import test from 'node:test';
import { browserVideoFileName, needsBrowserVideoTranscode, parseVideoStreamsFromFfmpegOutput } from './video';

test('normalizes QuickTime filenames to MP4 while preserving MP4 paths', () => {
  assert.equal(browserVideoFileName('materials/task/phone.mov'), 'materials/task/phone.mp4');
  assert.equal(browserVideoFileName('materials/task/phone.M4V'), 'materials/task/phone.mp4');
  assert.equal(browserVideoFileName('materials/task/phone.mp4'), 'materials/task/phone.mp4');
});

test('only stream-copies the browser baseline H.264/AAC streams', () => {
  assert.equal(needsBrowserVideoTranscode({
    streams: [
      { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  }), false);
  assert.equal(needsBrowserVideoTranscode({
    streams: [{ codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' }],
  }), true);
  assert.equal(needsBrowserVideoTranscode({
    streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio', codec_name: 'mp3' }],
  }), true);
});

test('reads mobile stream codecs from ffmpeg inspection output without ffprobe', () => {
  assert.deepEqual(parseVideoStreamsFromFfmpegOutput(`
    Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080
    Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo
  `), {
    streams: [
      { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  });
});
