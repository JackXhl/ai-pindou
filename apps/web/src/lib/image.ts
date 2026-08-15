/**
 * 图片读取与解码。
 *
 * 全程在浏览器本地完成，不上传任何数据——这既是隐私承诺，
 * 也让产品可以不做登录、不要服务器。
 */

/** 超过这个边长先缩一道再处理。手机直出照片动辄 4000px，直接送进管线纯属浪费。 */
const MAX_DIMENSION = 2048;

export interface DecodedImage {
  imageData: ImageData;
  width: number;
  height: number;
}

export class ImageDecodeError extends Error {}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageDecodeError('这不是图片文件，请选择 JPG、PNG 或 WebP。');
  }

  let bitmap: ImageBitmap;
  try {
    // from-image 让浏览器按 EXIF 方向解码。
    // 不加这一项，手机竖拍的照片会横过来——用户看到的是一张躺倒的图纸，
    // 而且多半会以为是自己拍错了。
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageDecodeError('图片无法解码，可能是格式不受支持或文件已损坏。');
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ImageDecodeError('浏览器不支持 Canvas，无法处理图片。');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { imageData: ctx.getImageData(0, 0, width, height), width, height };
}

/** 从剪贴板事件中取出图片。用户常常是直接截图后粘贴。 */
export function imageFileFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** 从拖放事件中取出第一个图片文件 */
export function imageFileFromDrop(event: DragEvent): File | null {
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return null;
  for (const file of files) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

/**
 * 按原图宽高比推荐图纸尺寸。
 *
 * 固定输出正方形会把人像压扁，而用户往往到摆完才发现。
 * 这里以长边对齐用户选定的格数，短边按比例取整。
 */
export function suggestGridSize(
  imageWidth: number,
  imageHeight: number,
  longestSide: number,
): { cols: number; rows: number } {
  if (imageWidth >= imageHeight) {
    return {
      cols: longestSide,
      rows: Math.max(1, Math.round((imageHeight / imageWidth) * longestSide)),
    };
  }
  return {
    cols: Math.max(1, Math.round((imageWidth / imageHeight) * longestSide)),
    rows: longestSide,
  };
}
