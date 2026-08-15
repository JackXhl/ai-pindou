/**
 * 矩形裁剪：从 ImageData 切出一块。
 * 坐标以原图像素为准，已钳位。
 */
export function cropImageData(
  src: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): ImageData {
  const left = Math.max(0, Math.min(src.width - 1, Math.floor(Math.min(x0, x1))));
  const top = Math.max(0, Math.min(src.height - 1, Math.floor(Math.min(y0, y1))));
  const right = Math.max(left + 1, Math.min(src.width, Math.ceil(Math.max(x0, x1))));
  const bottom = Math.max(top + 1, Math.min(src.height, Math.ceil(Math.max(y0, y1))));
  const w = right - left;
  const h = bottom - top;
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((top + y) * src.width + (left + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = src.data[si + 3]!;
    }
  }
  return out;
}
