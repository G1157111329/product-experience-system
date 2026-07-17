export type DetectedUploadMedia = {
  materialType: 'image' | 'video';
  mimeType: string;
  extension: string;
};

function startsWith(buffer: Buffer, values: number[]) {
  return values.every((value, index) => buffer[index] === value);
}

function isoBrand(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    ? buffer.subarray(8, 12).toString('ascii').toLowerCase()
    : '';
}

function isHeifBrand(brand: string) {
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand);
}

/**
 * Trust the file signature over unreliable mobile filename suffixes or generic
 * browser MIME values. A claimed image/video kind is still cross-checked.
 */
export function detectUploadMediaType(input: {
  fileName: string;
  declaredMime: string;
  prefix: Buffer;
}): DetectedUploadMedia {
  const { prefix } = input;
  const declaredMime = input.declaredMime.trim().toLowerCase();
  let detected: DetectedUploadMedia | null = null;

  if (startsWith(prefix, [0xff, 0xd8, 0xff])) {
    detected = { materialType: 'image', mimeType: 'image/jpeg', extension: 'jpg' };
  } else if (startsWith(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    detected = { materialType: 'image', mimeType: 'image/png', extension: 'png' };
  } else if (prefix.subarray(0, 6).toString('ascii') === 'GIF87a' || prefix.subarray(0, 6).toString('ascii') === 'GIF89a') {
    detected = { materialType: 'image', mimeType: 'image/gif', extension: 'gif' };
  } else if (prefix.subarray(0, 4).toString('ascii') === 'RIFF' && prefix.subarray(8, 12).toString('ascii') === 'WEBP') {
    detected = { materialType: 'image', mimeType: 'image/webp', extension: 'webp' };
  } else if (startsWith(prefix, [0x1a, 0x45, 0xdf, 0xa3])) {
    detected = { materialType: 'video', mimeType: 'video/webm', extension: 'webm' };
  } else {
    const brand = isoBrand(prefix);
    if (brand) {
      detected = isHeifBrand(brand)
        ? { materialType: 'image', mimeType: 'image/heic', extension: 'heic' }
        : { materialType: 'video', mimeType: 'video/mp4', extension: 'mp4' };
    }
  }

  if (!detected) throw new Error('不支持或无法识别该图片/视频文件');
  if (declaredMime.startsWith('image/') && detected.materialType !== 'image') {
    throw new Error('媒体类型与文件内容不一致');
  }
  if (declaredMime.startsWith('video/') && detected.materialType !== 'video') {
    throw new Error('媒体类型与文件内容不一致');
  }
  if (declaredMime && declaredMime !== 'application/octet-stream' && !declaredMime.startsWith('image/') && !declaredMime.startsWith('video/')) {
    throw new Error('仅支持图片和视频文件');
  }
  return detected;
}
