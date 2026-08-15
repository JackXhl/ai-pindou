/**
 * 色彩空间转换。
 *
 * 两条对成品质量影响极大的约束：
 *
 * 1. **降采样必须在线性 RGB 空间做。** 直接在 sRGB 上做平均会产生可见的
 *    亮度偏移，整张图纸发暗。sRGB 是带 gamma 的感知空间，对它做算术平均
 *    在物理上没有意义。
 * 2. **颜色匹配必须在 CIELAB 下用 CIEDE2000。** RGB 欧氏距离与人眼感知
 *    严重不符，会把明显不同的颜色判为接近。
 */

export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];
export type XYZ = readonly [number, number, number];

/** D65 / 2° 观察者白点 */
const D65 = { Xn: 0.95047, Yn: 1.0, Zn: 1.08883 } as const;

/** sRGB 分量（0-255）转线性 RGB（0-1） */
export function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** 线性 RGB（0-1）转 sRGB 分量（0-255，已钳位取整） */
export function linearToSrgb(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

/**
 * 预计算的 8bit 查表。降采样时每像素每通道都要做一次幂运算，
 * 4 万格的图纸约 200 万次，查表能省掉绝大部分开销。
 */
export const SRGB_TO_LINEAR_LUT: Float64Array = (() => {
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i);
  return lut;
})();

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6 && h.length !== 8) {
    throw new Error(`非法 HEX：${hex}`);
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: RGB): string {
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${f(rgb[0])}${f(rgb[1])}${f(rgb[2])}`;
}

/** 取出 #RRGGBBAA 的 alpha（0-1）；六位 HEX 视为完全不透明 */
export function hexAlpha(hex: string): number {
  const h = hex.replace('#', '').trim();
  if (h.length !== 8) return 1;
  return Number.parseInt(h.slice(6, 8), 16) / 255;
}

export function rgbToXyz(rgb: RGB): XYZ {
  const R = srgbToLinear(rgb[0]);
  const G = srgbToLinear(rgb[1]);
  const B = srgbToLinear(rgb[2]);
  return [
    0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  ];
}

const DELTA = 6 / 29;
const DELTA3 = DELTA ** 3;

function fLab(t: number): number {
  return t > DELTA3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}

export function xyzToLab(xyz: XYZ): Lab {
  const fx = fLab(xyz[0] / D65.Xn);
  const fy = fLab(xyz[1] / D65.Yn);
  const fz = fLab(xyz[2] / D65.Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function rgbToLab(rgb: RGB): Lab {
  return xyzToLab(rgbToXyz(rgb));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

/**
 * WCAG 相对亮度。用于决定格内色号文字取黑还是白——
 * 深色豆子上的黑字完全不可读，这是必须自动处理的可读性问题。
 */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * srgbToLinear(rgb[0]) +
    0.7152 * srgbToLinear(rgb[1]) +
    0.0722 * srgbToLinear(rgb[2])
  );
}

/** 该色块上应该用黑字还是白字 */
export function contrastTextColor(rgb: RGB): '#000000' | '#FFFFFF' {
  return relativeLuminance(rgb) > 0.5 ? '#000000' : '#FFFFFF';
}
