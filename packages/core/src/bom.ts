/**
 * 用料清单（BOM）。
 *
 * 必须同时给出「颗数」和「袋数」两个口径。用户的实际下单单位是袋
 * （约 10g / 1000 粒 / 1 袋起购），只输出「需 156 颗」等于把换算工作
 * 丢回给用户，而这正是他们打开工具想省掉的事。
 */

import { BEADS_PER_BAG, WASTAGE_RATIO, beadsToBags } from '@aipindou/registry';
import type { PaletteColor } from '@aipindou/registry';
import { EMPTY_CELL } from './pipeline/match.js';

export interface BomEntry {
  color: PaletteColor;
  /** grid 中的取值，用于点击图例高亮对应格子 */
  gridValue: number;
  beads: number;
  /** 含损耗后需要采购的袋数 */
  bags: number;
  /** 占总用量百分比，保留一位小数 */
  share: number;
}

export interface Bom {
  entries: BomEntry[];
  totalBeads: number;
  totalColors: number;
  totalBags: number;
  emptyCells: number;
  /** 计价与凑单提示所依据的口径，需在 UI 上如实标注 */
  assumptions: {
    beadsPerBag: number;
    wastageRatio: number;
  };
}

export function computeBom(
  grid: Uint16Array,
  colors: PaletteColor[],
): Bom {
  const counts = new Uint32Array(colors.length + 1);
  let empty = 0;

  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]!;
    if (v === EMPTY_CELL) {
      empty++;
      continue;
    }
    counts[v] = (counts[v] ?? 0) + 1;
  }

  let totalBeads = 0;
  for (let v = 1; v <= colors.length; v++) totalBeads += counts[v] ?? 0;

  const entries: BomEntry[] = [];
  for (let v = 1; v <= colors.length; v++) {
    const beads = counts[v] ?? 0;
    if (beads === 0) continue;
    entries.push({
      color: colors[v - 1]!,
      gridValue: v,
      beads,
      bags: beadsToBags(beads),
      share: totalBeads > 0 ? Number(((beads / totalBeads) * 100).toFixed(1)) : 0,
    });
  }

  // 按用量降序：用户备料时从大头开始，同时一眼能看到末尾的碎色
  entries.sort((a, b) => b.beads - a.beads);

  return {
    entries,
    totalBeads,
    totalColors: entries.length,
    totalBags: entries.reduce((sum, e) => sum + e.bags, 0),
    emptyCells: empty,
    assumptions: {
      beadsPerBag: BEADS_PER_BAG,
      wastageRatio: WASTAGE_RATIO,
    },
  };
}
