/**
 * 格内采样：把图像变成「每格一个颜色」。
 *
 * 提供两种策略，因为拼豆的题材分布跨度很大，单一策略必然有一半场景做不好：
 *
 * - smooth：Lanczos3 加权平均。渐变过渡自然，适合照片、写实插画。
 *   代价是会产生原图没有的中间色，一像素宽的线条会被稀释成灰边。
 * - dominant：格内取主色（众数）。轮廓锐利、纯色块不串色，适合像素画、
 *   卡通线稿、表情包这类拼豆最主流的题材。代价是边缘有锯齿。
 *
 * 默认走 auto：像素画类素材（颜色数少、色块整齐）用 dominant，其余用 smooth。
 * 把选择权也留给用户，因为「这张图该锐还是该柔」最终是审美判断。
 */

import { SRGB_TO_LINEAR_LUT } from '../color/convert.js';
import { resampleLanczos, toLinear, type SourceImage } from './resample.js';

export type SampleMode = 'smooth' | 'dominant' | 'auto';

export interface CellSamples {
  cols: number;
  rows: number;
  /** 每格的线性 RGB（未预乘），长度 cols * rows * 3 */
  rgb: Float32Array;
  /** 每格的不透明度覆盖率 0-1 */
  alpha: Float32Array;
}

/** 低于此覆盖率的格子视为空格，不摆豆 */
export const ALPHA_THRESHOLD = 0.5;

/**
 * 判断素材是否属于「像素画类」。
 *
 * 依据是去重后的颜色数：像素画、卡通线稿的调色板通常在几十色以内，
 * 而照片轻易上万色。阈值取 256 是经验值，宁可把边界情况判成 smooth，
 * 因为把照片当像素画处理的后果（大片色块断层）比反过来更难看。
 */
export function looksLikePixelArt(src: SourceImage): boolean {
  const seen = new Set<number>();
  const { data } = src;
  const total = src.width * src.height;
  // 大图全量统计没必要，等距抽样即可
  const step = Math.max(1, Math.floor(total / 20000));
  for (let i = 0; i < total; i += step) {
    const p = i * 4;
    if (data[p + 3]! < 128) continue;
    seen.add((data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!);
    if (seen.size > 256) return false;
  }
  return true;
}

/** smooth：Lanczos3 降采样后解预乘 */
function sampleSmooth(
  src: SourceImage,
  cols: number,
  rows: number,
): CellSamples {
  const linear = resampleLanczos(toLinear(src), cols, rows);
  const rgb = new Float32Array(cols * rows * 3);
  const alpha = new Float32Array(cols * rows);

  for (let i = 0, n = cols * rows; i < n; i++) {
    const p = i * 4;
    const a = linear.data[p + 3]!;
    alpha[i] = a;
    const q = i * 3;
    if (a > 0) {
      // 解预乘还原真实颜色，否则半透明格子会偏暗
      rgb[q] = linear.data[p]! / a;
      rgb[q + 1] = linear.data[p + 1]! / a;
      rgb[q + 2] = linear.data[p + 2]! / a;
    }
  }
  return { cols, rows, rgb, alpha };
}

/**
 * dominant：格内众数。
 *
 * 先把颜色量化到较粗的桶再统计众数，否则照片里几乎每个像素都是唯一颜色，
 * 众数退化成「随便取一个」。命中桶之后再用桶内像素的实际均值作为输出，
 * 这样既锁定了主导色，又不会被量化误差整体拉偏。
 */
function sampleDominant(
  src: SourceImage,
  cols: number,
  rows: number,
): CellSamples {
  const rgb = new Float32Array(cols * rows * 3);
  const alpha = new Float32Array(cols * rows);
  const { data, width, height } = src;

  // 每通道 32 级（右移 3 位），共 32768 个桶
  const bucketOf = (r: number, g: number, b: number) =>
    ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

  const counts = new Map<number, number>();
  const sums = new Map<number, [number, number, number]>();

  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor((gy * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / rows));
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / cols));

      counts.clear();
      sums.clear();
      let opaque = 0;
      let total = 0;

      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const p = (y * width + x) * 4;
          total++;
          const a = data[p + 3]!;
          // 透明像素不参与颜色统计，否则会把背景色混进主体
          if (a < 128) continue;
          opaque++;
          const r = data[p]!;
          const g = data[p + 1]!;
          const b = data[p + 2]!;
          const key = bucketOf(r, g, b);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          const s = sums.get(key);
          if (s) {
            s[0] += r;
            s[1] += g;
            s[2] += b;
          } else {
            sums.set(key, [r, g, b]);
          }
        }
      }

      const idx = gy * cols + gx;
      alpha[idx] = total > 0 ? opaque / total : 0;
      if (opaque === 0) continue;

      let bestKey = -1;
      let bestCount = -1;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
      }

      const sum = sums.get(bestKey)!;
      const q = idx * 3;
      rgb[q] = SRGB_TO_LINEAR_LUT[Math.round(sum[0] / bestCount)]!;
      rgb[q + 1] = SRGB_TO_LINEAR_LUT[Math.round(sum[1] / bestCount)]!;
      rgb[q + 2] = SRGB_TO_LINEAR_LUT[Math.round(sum[2] / bestCount)]!;
    }
  }

  return { cols, rows, rgb, alpha };
}

export function sampleCells(
  src: SourceImage,
  cols: number,
  rows: number,
  mode: SampleMode = 'auto',
): CellSamples {
  const resolved =
    mode === 'auto' ? (looksLikePixelArt(src) ? 'dominant' : 'smooth') : mode;
  return resolved === 'dominant'
    ? sampleDominant(src, cols, rows)
    : sampleSmooth(src, cols, rows);
}
