/**
 * 去背景。
 *
 * 从四条边界向内做 flood-fill，把与边缘同色的连通区域清成空格。
 * 只从边界出发是关键：若按颜色全局清除，主体内部与背景同色的区域
 * （白衣服、白色高光）会被一并挖空。
 *
 * 只对不含 alpha 通道的素材有意义（JPG、截图）。PNG 抠图素材的透明区域
 * 在采样阶段就已经是空格了。
 */

import { deltaE2000 } from '../color/ciede2000.js';
import type { Lab } from '../color/convert.js';
import type { PaletteColor } from '@aipindou/registry';
import { EMPTY_CELL } from './match.js';

/** 与边缘色的容差。默认值偏保守，宁可留下背景也不要挖穿主体。 */
export const DEFAULT_BG_TOLERANCE = 6;

export function removeBackground(
  grid: Uint16Array,
  cols: number,
  rows: number,
  colors: PaletteColor[],
  tolerance = DEFAULT_BG_TOLERANCE,
): number {
  const n = cols * rows;
  const visited = new Uint8Array(n);
  const stack: number[] = [];

  const seed = (i: number) => {
    if (!visited[i] && grid[i] !== EMPTY_CELL) {
      visited[i] = 1;
      stack.push(i);
    }
  };

  // 以四角与四边的多数色作为背景色基准，比只取左上角一格稳健
  const edgeCounts = new Map<number, number>();
  const tally = (i: number) => {
    const v = grid[i]!;
    if (v !== EMPTY_CELL) edgeCounts.set(v, (edgeCounts.get(v) ?? 0) + 1);
  };
  for (let x = 0; x < cols; x++) {
    tally(x);
    tally((rows - 1) * cols + x);
  }
  for (let y = 0; y < rows; y++) {
    tally(y * cols);
    tally(y * cols + cols - 1);
  }
  if (edgeCounts.size === 0) return 0;

  let bgValue = -1;
  let bgCount = -1;
  for (const [v, c] of edgeCounts) {
    if (c > bgCount) {
      bgCount = c;
      bgValue = v;
    }
  }
  const bgLab = colors[bgValue - 1]!.lab as Lab;

  for (let x = 0; x < cols; x++) {
    seed(x);
    seed((rows - 1) * cols + x);
  }
  for (let y = 0; y < rows; y++) {
    seed(y * cols);
    seed(y * cols + cols - 1);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const v = grid[cur]!;
    if (v === EMPTY_CELL) continue;
    if (deltaE2000(bgLab, colors[v - 1]!.lab as Lab) > tolerance) continue;

    grid[cur] = EMPTY_CELL;
    cleared++;

    const x = cur % cols;
    const y = (cur / cols) | 0;
    const push = (nx: number, ny: number) => {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;
      const ni = ny * cols + nx;
      if (!visited[ni]) {
        visited[ni] = 1;
        stack.push(ni);
      }
    };
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return cleared;
}
