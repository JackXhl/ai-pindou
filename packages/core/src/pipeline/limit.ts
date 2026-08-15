/**
 * 限色：把图纸的色号数压到指定上限。
 *
 * 用户限色的动机通常不是审美而是成本与工序——每多一个色号就多一袋豆、
 * 多一次找豆分拣。因此合并顺序按「代价」而非单纯按色差：
 * 优先牺牲那些用量本来就少、且有接近替代的颜色。
 */

import { deltaE2000 } from '../color/ciede2000.js';
import type { Lab } from '../color/convert.js';
import type { PaletteColor } from '@aipindou/registry';
import { EMPTY_CELL } from './match.js';

export interface LimitResult {
  /** 被合并掉的色号 */
  removed: string[];
  /** 合并造成的最大色差，用于提示用户限色是否损伤了画面 */
  maxDeltaE: number;
}

export function limitColors(
  grid: Uint16Array,
  colors: PaletteColor[],
  maxColors: number,
): LimitResult {
  const removed: string[] = [];
  let maxDeltaE = 0;
  if (maxColors <= 0) return { removed, maxDeltaE };

  const counts = new Map<number, number>();
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]!;
    if (v === EMPTY_CELL) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size <= maxColors) return { removed, maxDeltaE };

  const remap = new Map<number, number>();

  while (counts.size > maxColors) {
    let victim = -1;
    let target = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestDelta = 0;

    for (const [v, count] of counts) {
      const from = colors[v - 1]!.lab as Lab;
      let nearest = -1;
      let nearestDelta = Number.POSITIVE_INFINITY;
      for (const [other] of counts) {
        if (other === v) continue;
        const d = deltaE2000(from, colors[other - 1]!.lab as Lab);
        if (d < nearestDelta) {
          nearestDelta = d;
          nearest = other;
        }
      }
      if (nearest < 0) continue;
      // 代价 = 影响格数 × 色差。小面积且有近似替代的颜色最先被牺牲。
      const cost = count * nearestDelta;
      if (cost < bestCost) {
        bestCost = cost;
        victim = v;
        target = nearest;
        bestDelta = nearestDelta;
      }
    }

    if (victim < 0 || target < 0) break;

    counts.set(target, (counts.get(target) ?? 0) + (counts.get(victim) ?? 0));
    counts.delete(victim);
    remap.set(victim, target);
    removed.push(colors[victim - 1]!.code);
    if (bestDelta > maxDeltaE) maxDeltaE = bestDelta;
  }

  if (remap.size > 0) {
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i]!;
      if (v === EMPTY_CELL) continue;
      // 合并可能形成链（A→B，B→C），需要一路跟到终点
      let to = v;
      const guard = new Set<number>();
      while (remap.has(to) && !guard.has(to)) {
        guard.add(to);
        to = remap.get(to)!;
      }
      if (to !== v) grid[i] = to;
    }
  }

  return { removed, maxDeltaE };
}
