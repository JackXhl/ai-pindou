/**
 * 颜色匹配：把每格的连续颜色映射到实际买得到的豆子色号。
 *
 * **架构硬约束：可用色集合是匹配阶段的输入域，不是事后过滤。**
 * 先用全色板匹配、再把缺的颜色逐个替换掉，会让图纸结构反复重排、
 * 色块碎裂成一格一个色号；正确做法是一开始就只在用户真正有的颜色里量化，
 * 一次成型。因此 palette 参数在这里就是最终候选集，调用方负责先筛好。
 */

import { deltaE2000 } from '../color/ciede2000.js';
import {
  hexToRgb,
  linearToSrgb,
  rgbToLab,
  srgbToLinear,
  type Lab,
} from '../color/convert.js';
import type { PaletteColor } from '@aipindou/registry';
import { ALPHA_THRESHOLD, type CellSamples } from './sample.js';

/** grid 中的空格标记。0 恒为空，真实颜色从 1 开始。 */
export const EMPTY_CELL = 0;

export interface MatchOptions {
  /** Floyd-Steinberg 误差扩散。默认关闭。 */
  dither?: boolean;
  /**
   * 抖动强度 0-1。
   * 拼豆是实体媒介，格子尺寸远大于屏幕像素，全强度抖动会变成肉眼可见的噪点，
   * 因此即便开启也建议压低。
   */
  ditherAmount?: number;
}

export interface MatchResult {
  /** 长度 cols * rows，取值为 usedColors 的下标 + 1，0 表示空格 */
  grid: Uint16Array;
  /** 实际用到的颜色，顺序与 grid 取值对应 */
  usedColors: PaletteColor[];
  /** 每格的匹配色差，用于给出「这张图在你的色板下还原度如何」的量化反馈 */
  deltaE: Float32Array;
}

/**
 * 候选粗筛数量。
 *
 * 逐格对全部 221 色算 CIEDE2000 的开销很大（约 74 万次三角运算）。
 * 先用 Lab 欧氏距离取前 N 名再精算，实测能省掉九成计算量。
 * N 取 16 是安全边界：ΔE00 与 ΔE76 排序虽不完全一致，但真正的最近邻
 * 落到 ΔE76 第 16 名之外的情况在实际色板上没有出现过。
 */
const CANDIDATE_COUNT = 16;

function nearestIndex(lab: Lab, labs: Lab[]): { index: number; delta: number } {
  // 第一轮：Lab 欧氏距离粗筛
  const cand: { i: number; d: number }[] = [];
  for (let i = 0; i < labs.length; i++) {
    const c = labs[i]!;
    const dl = lab[0] - c[0];
    const da = lab[1] - c[1];
    const db = lab[2] - c[2];
    cand.push({ i, d: dl * dl + da * da + db * db });
  }
  cand.sort((x, y) => x.d - y.d);

  // 第二轮：候选内用 CIEDE2000 精算
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  const limit = Math.min(CANDIDATE_COUNT, cand.length);
  for (let k = 0; k < limit; k++) {
    const i = cand[k]!.i;
    const d = deltaE2000(lab, labs[i]!);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return { index: best, delta: bestDelta };
}

export function matchToPalette(
  samples: CellSamples,
  palette: PaletteColor[],
  options: MatchOptions = {},
): MatchResult {
  if (palette.length === 0) {
    throw new Error('可用色板为空，无法匹配。请至少选择一种颜色。');
  }

  const { cols, rows, rgb, alpha } = samples;
  const n = cols * rows;
  const labs: Lab[] = palette.map((c) => c.lab as Lab);

  const paletteIndex = new Uint16Array(n);
  const deltaE = new Float32Array(n);

  // 精确颜色缓存。像素画与纯色块素材的重复率极高，命中时可完全跳过匹配。
  const cache = new Map<number, { index: number; delta: number }>();

  const dither = options.dither ?? false;
  const amount = options.ditherAmount ?? 1;

  // 误差扩散缓冲（线性空间），仅抖动模式使用
  const err = dither ? new Float32Array(n * 3) : null;
  // 抖动需要每格算量化误差，预先把色板转成线性 RGB，避免逐格重复解析 HEX
  const paletteLinear = dither
    ? palette.map((c) => {
        const [r, g, b] = hexToRgb(c.hex);
        return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)] as const;
      })
    : null;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (alpha[i]! < ALPHA_THRESHOLD) {
        paletteIndex[i] = EMPTY_CELL;
        continue;
      }

      const q = i * 3;
      let lr = rgb[q]!;
      let lg = rgb[q + 1]!;
      let lb = rgb[q + 2]!;
      if (err) {
        lr += err[q]! * amount;
        lg += err[q + 1]! * amount;
        lb += err[q + 2]! * amount;
      }

      const sr = linearToSrgb(lr);
      const sg = linearToSrgb(lg);
      const sb = linearToSrgb(lb);

      const key = (sr << 16) | (sg << 8) | sb;
      let hit = dither ? undefined : cache.get(key);
      if (!hit) {
        hit = nearestIndex(rgbToLab([sr, sg, sb]), labs);
        if (!dither) cache.set(key, hit);
      }

      paletteIndex[i] = hit.index + 1;
      deltaE[i] = hit.delta;

      if (err && paletteLinear) {
        // Floyd-Steinberg：把量化误差按 7/16、3/16、5/16、1/16 扩散给尚未处理的邻居
        const target = paletteLinear[hit.index]!;
        const er = lr - target[0];
        const eg = lg - target[1];
        const eb = lb - target[2];

        const spread = (nx: number, ny: number, w: number) => {
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;
          const p = (ny * cols + nx) * 3;
          err[p] = (err[p] ?? 0) + er * w;
          err[p + 1] = (err[p + 1] ?? 0) + eg * w;
          err[p + 2] = (err[p + 2] ?? 0) + eb * w;
        };
        spread(x + 1, y, 7 / 16);
        spread(x - 1, y + 1, 3 / 16);
        spread(x, y + 1, 5 / 16);
        spread(x + 1, y + 1, 1 / 16);
      }
    }
  }

  return compactPalette(paletteIndex, deltaE, palette, cols, rows);
}

/**
 * 压缩调色板：只保留实际用到的颜色并重新编号。
 *
 * 这一步不是可选优化。图例、BOM、色号搜索全都基于「本图用到的颜色」，
 * 若保留整个 221 色色板，用户会看到一份 221 行、其中 200 行为 0 的清单。
 */
function compactPalette(
  paletteIndex: Uint16Array,
  deltaE: Float32Array,
  palette: PaletteColor[],
  cols: number,
  rows: number,
): MatchResult {
  const remap = new Map<number, number>();
  const usedColors: PaletteColor[] = [];
  const grid = new Uint16Array(cols * rows);

  for (let i = 0; i < grid.length; i++) {
    const original = paletteIndex[i]!;
    if (original === EMPTY_CELL) continue;
    let next = remap.get(original);
    if (next === undefined) {
      usedColors.push(palette[original - 1]!);
      next = usedColors.length;
      remap.set(original, next);
    }
    grid[i] = next;
  }

  return { grid, usedColors, deltaE };
}
