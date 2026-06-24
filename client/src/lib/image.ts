export interface PreparedImage {
  /** A downscaled `data:image/jpeg` URL, ready to send and render. */
  url: string;
  name: string;
}

const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.9;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) {
    return { width, height };
  }
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Decode, downscale (longest edge ≤ 1568px), and re-encode an image file as a JPEG data URL.
 * Hermes only accepts inline images (no upload API) and gains nothing above ~1.5k px, so this keeps
 * payloads well under the gateway's body limit while preserving legible detail.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name || 'File'} is not an image`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${file.name || 'Image'} is too large (max 25MB)`);
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not process image');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { url: canvas.toDataURL('image/jpeg', JPEG_QUALITY), name: file.name || 'image' };
  } finally {
    bitmap.close();
  }
}
