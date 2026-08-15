/**
 * 构建期色彩数学（纯 JS，零依赖）。
 *
 * 为什么不直接复用 packages/core 的实现：registry 不依赖任何东西是硬约束，
 * 而构建脚本运行在 Node 下、core 是 TS 源码，引入编译步骤得不偿失。
 * 代价是同一套公式存在两份实现，因此 core 的单测里有一条一致性测试，
 * 会读取本脚本产出的 lab 值与 core 的实现逐条比对，防止两边漂移。
 *
 * 参考：Sharma, Wu & Dalal (2005) 的 CIEDE2000 实现说明。
 */

const D65 = { Xn: 0.95047, Yn: 1.0, Zn: 1.08883 };

/** sRGB 分量（0-255）转线性 RGB（0-1） */
export function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 线性 RGB（0-1）转 sRGB 分量（0-255） */
export function linearToSrgb(v) {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

/** #RRGGBB 或 #RRGGBBAA 转 [r,g,b]，忽略 alpha */
export function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6 && h.length !== 8) {
    throw new Error(`非法 HEX：${hex}`);
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]) {
  const f = (v) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** sRGB（0-255）转 CIEXYZ（D65 / 2° 观察者） */
export function rgbToXyz([r, g, b]) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return [
    0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  ];
}

const DELTA = 6 / 29;
function fLab(t) {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}

/** CIEXYZ 转 CIELAB */
export function xyzToLab([x, y, z]) {
  const fx = fLab(x / D65.Xn);
  const fy = fLab(y / D65.Yn);
  const fz = fLab(z / D65.Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** sRGB（0-255）直接转 CIELAB */
export function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

export function hexToLab(hex) {
  return rgbToLab(hexToRgb(hex));
}

const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

/**
 * CIEDE2000 色差。kL = kC = kH = 1。
 *
 * 这个公式极易实现错，最常见的两处是色相环绕（hue wraparound）与 R_T 旋转项。
 * core 侧的实现用 Sharma 2005 的全部 34 组参考数据做单测，误差需小于 1e-4。
 */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  // atan2(0, 0) 定义为 0；负角补 360
  let h1p = a1p === 0 && b1 === 0 ? 0 : deg(Math.atan2(b1, a1p));
  if (h1p < 0) h1p += 360;
  let h2p = a2p === 0 && b2 === 0 ? 0 : deg(Math.atan2(b2, a2p));
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));

  const SL =
    1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * Rc;

  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(
    termL * termL + termC * termC + termH * termH + RT * termC * termH,
  );
}

/** WCAG 相对亮度，用于决定格内文字用黑还是白 */
export function relativeLuminance([r, g, b]) {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}
