/**
 * 图像降采样。
 *
 * 全程在**线性 RGB** 空间做。这不是精细的优化而是正确性问题：
 * sRGB 是带 gamma 的感知编码，直接对它做加权平均在物理上没有意义，
 * 结果是整张图纸系统性偏暗，在明暗交界处尤其明显。
 *
 * 同时对 alpha 做**预乘**后再重采样。不预乘的话，全透明像素携带的
 * 垃圾颜色值会渗进半透明边缘，表现为抠图素材的边缘出现一圈杂色。
 */

import { SRGB_TO_LINEAR_LUT } from '../color/convert.js';

/** 线性空间的图像缓冲，RGB 已预乘 alpha */
export interface LinearImage {
  width: number;
  height: number;
  /** 长度 width * height * 4，顺序 R G B A，取值 0-1 */
  data: Float32Array;
}

export interface SourceImage {
  width: number;
  height: number;
  /** RGBA8，与 ImageData.data 同构 */
  data: Uint8ClampedArray | Uint8Array;
}

/** sRGB8 转线性空间并预乘 alpha */
export function toLinear(src: SourceImage): LinearImage {
  const { width, height, data } = src;
  const out = new Float32Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const p = i * 4;
    const a = data[p + 3]! / 255;
    out[p] = SRGB_TO_LINEAR_LUT[data[p]!]! * a;
    out[p + 1] = SRGB_TO_LINEAR_LUT[data[p + 1]!]! * a;
    out[p + 2] = SRGB_TO_LINEAR_LUT[data[p + 2]!]! * a;
    out[p + 3] = a;
  }
  return { width, height, data: out };
}

const LANCZOS_A = 3;

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos(x: number): number {
  const ax = Math.abs(x);
  if (ax >= LANCZOS_A) return 0;
  return sinc(x) * sinc(x / LANCZOS_A);
}

interface Contribution {
  start: number;
  weights: Float32Array;
}

/** 预计算某一维度上每个目标像素的采样权重 */
function buildContributions(srcSize: number, dstSize: number): Contribution[] {
  const scale = dstSize / srcSize;
  // 降采样时必须按比例展宽滤波核，否则等于没做抗锯齿，细节会直接混叠成噪点
  const filterScale = scale < 1 ? scale : 1;
  const support = LANCZOS_A / filterScale;

  const list: Contribution[] = [];
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) / scale - 0.5;
    let start = Math.ceil(center - support);
    let end = Math.floor(center + support);
    if (start < 0) start = 0;
    if (end > srcSize - 1) end = srcSize - 1;

    const count = end - start + 1;
    const weights = new Float32Array(count);
    let sum = 0;
    for (let j = 0; j < count; j++) {
      const w = lanczos((start + j - center) * filterScale);
      weights[j] = w;
      sum += w;
    }
    // 归一化。边界处核被截断，不归一化会导致图像四周变暗。
    if (sum !== 0) {
      for (let j = 0; j < count; j++) weights[j] = weights[j]! / sum;
    }
    list.push({ start, weights });
  }
  return list;
}

/**
 * 盒式预缩放。
 *
 * 手机直出照片常有 4000px 宽，降到 58 格是近 70 倍缩放，此时 Lanczos 的
 * 核半径达到 200 像素以上，计算量按平方增长。先用盒式滤波把倍率压到 4 倍
 * 以内再走 Lanczos，质量几乎无损而耗时下降一个数量级。
 */
function boxPrescale(img: LinearImage, factor: number): LinearImage {
  if (factor <= 1) return img;
  const w = Math.max(1, Math.floor(img.width / factor));
  const h = Math.max(1, Math.floor(img.height / factor));
  const out = new Float32Array(w * h * 4);
  const xRatio = img.width / w;
  const yRatio = img.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.min(img.height, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.min(img.width, Math.floor((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * img.width + sx) * 4;
          r += img.data[p]!;
          g += img.data[p + 1]!;
          b += img.data[p + 2]!;
          a += img.data[p + 3]!;
          n++;
        }
      }
      const p = (y * w + x) * 4;
      if (n > 0) {
        out[p] = r / n;
        out[p + 1] = g / n;
        out[p + 2] = b / n;
        out[p + 3] = a / n;
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** Lanczos3 重采样到指定尺寸，输入输出均为线性预乘空间 */
export function resampleLanczos(
  img: LinearImage,
  dstWidth: number,
  dstHeight: number,
): LinearImage {
  const prescale = Math.floor(
    Math.min(img.width / dstWidth, img.height / dstHeight) / 4,
  );
  const src = prescale > 1 ? boxPrescale(img, prescale) : img;

  // 水平方向
  const hContrib = buildContributions(src.width, dstWidth);
  const tmp = new Float32Array(dstWidth * src.height * 4);
  for (let y = 0; y < src.height; y++) {
    const rowOffset = y * src.width * 4;
    for (let x = 0; x < dstWidth; x++) {
      const { start, weights } = hContrib[x]!;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < weights.length; k++) {
        const w = weights[k]!;
        if (w === 0) continue;
        const p = rowOffset + (start + k) * 4;
        r += src.data[p]! * w;
        g += src.data[p + 1]! * w;
        b += src.data[p + 2]! * w;
        a += src.data[p + 3]! * w;
      }
      const q = (y * dstWidth + x) * 4;
      tmp[q] = r;
      tmp[q + 1] = g;
      tmp[q + 2] = b;
      tmp[q + 3] = a;
    }
  }

  // 垂直方向
  const vContrib = buildContributions(src.height, dstHeight);
  const out = new Float32Array(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y++) {
    const { start, weights } = vContrib[y]!;
    for (let x = 0; x < dstWidth; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < weights.length; k++) {
        const w = weights[k]!;
        if (w === 0) continue;
        const p = ((start + k) * dstWidth + x) * 4;
        r += tmp[p]! * w;
        g += tmp[p + 1]! * w;
        b += tmp[p + 2]! * w;
        a += tmp[p + 3]! * w;
      }
      const q = (y * dstWidth + x) * 4;
      // Lanczos 有负瓣，会产生越界的振铃值，必须钳位
      out[q] = Math.max(0, r);
      out[q + 1] = Math.max(0, g);
      out[q + 2] = Math.max(0, b);
      out[q + 3] = Math.min(1, Math.max(0, a));
    }
  }

  return { width: dstWidth, height: dstHeight, data: out };
}
