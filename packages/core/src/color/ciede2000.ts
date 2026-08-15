/**
 * CIEDE2000 色差公式。
 *
 * 这个公式极易实现错，最常见的两处是**色相环绕**（hue wraparound）与
 * **R_T 旋转项**。写错后的表现是绝大多数颜色算出来都对，只在特定色相区间
 * 出错，肉眼评审几乎不可能发现。因此本实现用 Sharma, Wu & Dalal (2005)
 * 的全部 34 组参考数据做单测，误差需小于 1e-4，见 ciede2000.test.ts。
 *
 * ΔE00 ≈ 1 是受控观察条件下相邻色块的恰可察觉差。但成品中同色豆彼此分开
 * 摆放，容忍度显著更高——实践中 ΔE 2 到 5 的替代通常察觉不到，
 * 所以不必对这一档过度告警。
 */

import type { Lab } from './convert.js';

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

const POW25_7 = 25 ** 7;

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  // 色相角：a' 与 b 同时为 0 时定义为 0，负角补满 360
  let h1p = a1p === 0 && b1 === 0 ? 0 : toDeg(Math.atan2(b1, a1p));
  if (h1p < 0) h1p += 360;
  let h2p = a2p === 0 && b2 === 0 ? 0 : toDeg(Math.atan2(b2, a2p));
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  // 色相差的环绕处理，第一个常见错误点
  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(toRad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  // 平均色相同样要处理环绕
  let hbarp: number;
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
    0.17 * Math.cos(toRad(hbarp - 30)) +
    0.24 * Math.cos(toRad(2 * hbarp)) +
    0.32 * Math.cos(toRad(3 * hbarp + 6)) -
    0.2 * Math.cos(toRad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));

  const SL =
    1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;

  // R_T 旋转项，第二个常见错误点
  const RT = -Math.sin(toRad(2 * dTheta)) * Rc;

  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(
    termL * termL + termC * termC + termH * termH + RT * termC * termH,
  );
}

/**
 * 匹配质量分档。沿用 Bitbead 数据集的口径，便于与其换算表交叉对照。
 *
 * 注意 identical 并不代表物理上同一颗豆——HEX 本身来自产品摄影与商家色板，
 * 不是分光光度计实测，ΔE < 1 的差异本就在噪声范围内。
 */
export type MatchQuality =
  | 'identical'
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor';

export function matchQuality(deltaE: number): MatchQuality {
  if (deltaE < 1) return 'identical';
  if (deltaE < 2) return 'excellent';
  if (deltaE < 5) return 'good';
  if (deltaE < 10) return 'fair';
  return 'poor';
}

/** fair 与 poor 必须在 UI 上明确告警，不能假装每次换算都成立 */
export function isRiskyMatch(deltaE: number): boolean {
  return deltaE >= 5;
}
