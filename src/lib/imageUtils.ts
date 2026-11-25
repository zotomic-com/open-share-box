export interface ImageCompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  mime?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
  maxBytes?: number;
}

export interface CompressedImage {
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read this image file.'));
    };
    image.src = url;
  });
}

/**
 * Reads a device image, downscales it to fit the requested bounds, and encodes
 * it as a data URL small enough to store in Firestore.
 */
export async function fileToCompressedDataUrl(
  file: File,
  options: ImageCompressOptions = {}
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, WebP, or GIF).');
  }

  const maxWidth = Math.max(32, options.maxWidth ?? 1600);
  const maxHeight = Math.max(32, options.maxHeight ?? 1600);
  const mime = options.mime ?? 'image/jpeg';
  const startQuality = Math.min(0.98, Math.max(0.4, options.quality ?? 0.82));
  const maxBytes = Math.max(20_000, options.maxBytes ?? 620_000);

  const image = await loadImage(file);
  let scale = Math.min(1, maxWidth / Math.max(1, image.width), maxHeight / Math.max(1, image.height));
  let quality = startQuality;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const width = Math.max(16, Math.round(image.width * scale));
    const height = Math.max(16, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image compression is not supported in this browser.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL(mime, quality);
    if (dataUrl.length <= maxBytes) {
      return { dataUrl, mime, width, height };
    }

    if (mime !== 'image/png' && quality > 0.5) {
      quality = Math.max(0.45, quality - 0.12);
    } else {
      scale *= 0.82;
    }
  }

  throw new Error('This image is too large to store. Please choose a smaller image.');
}

export function dataUrlToMime(dataUrl: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match ? match[1] : 'image/jpeg';
}
