/**
 * 降噪与碎色治理。
 *
 * 这两件事解决的是同一类抱怨的两个侧面——「一格一个色号、脸上全是碎色」
 * 是拼豆用户对自动生成图纸最集中的吐槽，其价值高于多支持一个品牌色卡：
 *
 * - removeSmallRegions：空间上孤立的一两格噪点，摆起来极其费事且看不出效果
 * - mergeRareColors：全图只用到两三颗的色号，逼用户为此单独买一整袋豆
 *
 * 两者都设了「替代色必须足够接近」的闸门。无差别合并会毁掉有意为之的细节
 * ——眼睛高光可能本来就只有两格，深色脸上的那一点纯白是不能省的。
 */

import { deltaE2000 } from '../color/ciede2000.js';
import type { Lab } from '../color/convert.js';
import type { PaletteColor } from '@aipindou/registry';
import { EMPTY_CELL } from './match.js';

export interface DenoiseOptions {
  /** 连通域小于等于此格数视为噪点。0 表示关闭。 */
  minRegionSize?: number;
  /** 全图用量小于此颗数的色号视为碎色。0 表示关闭。 */
  minColorCount?: number;
  /**
   * 允许的最大替代色差。
   * 超过这个色差说明该颜色不可替代（例如深色区域里唯一的高光），
   * 宁可保留碎色也不能把它抹掉。
   */
  maxMergeDeltaE?: number;
}

export const DEFAULT_DENOISE: Required<DenoiseOptions> = {
  minRegionSize: 2,
  minColorCount: 4,
  maxMergeDeltaE: 12,
};

/**
 * 消除孤立小连通域，合并到边界上出现最多的邻色。
 *
 * 用显式栈做 BFS 而非递归：大面积同色区域的连通域可达数千格，
 * 递归会直接爆栈。
 */
export function removeSmallRegions(
  grid: Uint16Array,
  cols: number,
  rows: number,
  colors: PaletteColor[],
  options: DenoiseOptions = {},
): number {
  const minSize = options.minRegionSize ?? DEFAULT_DENOISE.minRegionSize;
  const maxDelta = options.maxMergeDeltaE ?? DEFAULT_DENOISE.maxMergeDeltaE;
  if (minSize <= 0) return 0;

  const n = cols * rows;
  const visited = new Uint8Array(n);
  const stack: number[] = [];
  const region: number[] = [];
  const replacements: { cells: number[]; to: number }[] = [];

  for (let start = 0; start < n; start++) {
    if (visited[start] || grid[start] === EMPTY_CELL) continue;

    const value = grid[start]!;
    region.length = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;

    // 边界上各邻色出现的次数，用于决定合并目标
    const borderCounts = new Map<number, number>();

    while (stack.length > 0) {
      const cur = stack.pop()!;
      region.push(cur);
      const x = cur % cols;
      const y = (cur / cols) | 0;

      const visit = (nx: number, ny: number) => {
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;
        const ni = ny * cols + nx;
        const nv = grid[ni]!;
        if (nv === value) {
          if (!visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        } else if (nv !== EMPTY_CELL) {
          borderCounts.set(nv, (borderCounts.get(nv) ?? 0) + 1);
        }
      };
      visit(x + 1, y);
      visit(x - 1, y);
      visit(x, y + 1);
      visit(x, y - 1);
    }

    if (region.length > minSize || borderCounts.size === 0) continue;

    // 在边界邻色中选出现次数最多的；并列时取色差最小的
    const from = colors[value - 1]!.lab as Lab;
    let bestValue = -1;
    let bestCount = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const [candidate, count] of borderCounts) {
      const delta = deltaE2000(from, colors[candidate - 1]!.lab as Lab);
      if (count > bestCount || (count === bestCount && delta < bestDelta)) {
        bestValue = candidate;
        bestCount = count;
        bestDelta = delta;
      }
    }

    if (bestValue > 0 && bestDelta <= maxDelta) {
      replacements.push({ cells: [...region], to: bestValue });
    }
  }

  let changed = 0;
  for (const { cells, to } of replacements) {
    for (const cell of cells) {
      grid[cell] = to;
      changed++;
    }
  }
  return changed;
}

export interface MergeRareResult {
  /** 被合并掉的色号数 */
  mergedColors: number;
  /** 因不可替代而保留的碎色号 */
  keptRare: string[];
}

/**
 * 碎色治理：把全图只用到几颗的色号并入最接近的常用色。
 *
 * 实体拼豆的最小采购单位是一整袋（约 1000 粒），为两颗豆单独买一袋
 * 是真实的钱和物流等待，所以这一步的收益是直接的。
 */
export function mergeRareColors(
  grid: Uint16Array,
  colors: PaletteColor[],
  options: DenoiseOptions = {},
): MergeRareResult {
  const minCount = options.minColorCount ?? DEFAULT_DENOISE.minColorCount;
  const maxDelta = options.maxMergeDeltaE ?? DEFAULT_DENOISE.maxMergeDeltaE;
  if (minCount <= 0) return { mergedColors: 0, keptRare: [] };

  const counts = new Uint32Array(colors.length + 1);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]!;
    counts[v] = (counts[v] ?? 0) + 1;
  }

  const rare: number[] = [];
  const common: number[] = [];
  for (let v = 1; v <= colors.length; v++) {
    if (counts[v] === 0) continue;
    if (counts[v]! < minCount) rare.push(v);
    else common.push(v);
  }

  // 全图都是稀有色（极简像素画）时不做任何合并，否则会把整张图合没了
  if (common.length === 0) {
    return { mergedColors: 0, keptRare: rare.map((v) => colors[v - 1]!.code) };
  }

  const remap = new Map<number, number>();
  const keptRare: string[] = [];

  for (const v of rare) {
    const from = colors[v - 1]!.lab as Lab;
    let best = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const c of common) {
      const d = deltaE2000(from, colors[c - 1]!.lab as Lab);
      if (d < bestDelta) {
        bestDelta = d;
        best = c;
      }
    }
    if (best > 0 && bestDelta <= maxDelta) {
      remap.set(v, best);
    } else {
      // 找不到足够接近的替代，说明这个碎色承担着不可替代的作用，保留
      keptRare.push(colors[v - 1]!.code);
    }
  }

  if (remap.size > 0) {
    for (let i = 0; i < grid.length; i++) {
      const to = remap.get(grid[i]!);
      if (to !== undefined) grid[i] = to;
    }
  }

  return { mergedColors: remap.size, keptRare };
}
