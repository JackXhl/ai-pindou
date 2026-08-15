/**
 * 生成管线编排。
 *
 * 全流程零 DOM 依赖，输入是裸的 RGBA 缓冲，输出是 Pattern。
 * 这样引擎可以在 Node 下直接跑端到端测试，不必启动浏览器；
 * 也能原样放进 Web Worker。
 */

import type { Palette, PaletteColor, Pattern } from '@aipindou/registry';
import { computeBom, type Bom } from './bom.js';
import { removeBackground, DEFAULT_BG_TOLERANCE } from './pipeline/background.js';
import {
  DEFAULT_DENOISE,
  mergeRareColors,
  removeSmallRegions,
  type DenoiseOptions,
} from './pipeline/denoise.js';
import { limitColors } from './pipeline/limit.js';
import { EMPTY_CELL, matchToPalette, type MatchOptions } from './pipeline/match.js';
import { sampleCells, type SampleMode } from './pipeline/sample.js';
import type { SourceImage } from './pipeline/resample.js';

export interface GenerateOptions {
  cols: number;
  rows: number;

  /**
   * 可用色集合，即匹配阶段的输入域。
   *
   * 这是架构约束而非便利参数：必须在量化前就把候选集限定为用户真正拥有的
   * 颜色，一次成型。事后把缺的颜色逐个替换掉会导致色块碎裂、图纸结构重排。
   * 不传则使用整个色板。
   */
  availableColors?: PaletteColor[];

  sampleMode?: SampleMode;
  dither?: boolean;
  ditherAmount?: number;

  /** 上限色号数。0 表示不限。 */
  maxColors?: number;

  denoise?: DenoiseOptions;

  /** 去背景。含 alpha 的素材通常不需要。 */
  removeBackground?: boolean;
  backgroundTolerance?: number;

  specId?: string;
}

export interface GenerateResult {
  pattern: Pattern;
  bom: Bom;
  /** 生成过程的量化反馈，用于向用户如实交代画面被改动了多少 */
  report: GenerateReport;
}

export interface GenerateReport {
  /** 平均匹配色差。数值越高说明当前色板越还原不了这张图。 */
  averageDeltaE: number;
  /** 最差的匹配色差 */
  maxDeltaE: number;
  /** 降噪改动的格数 */
  denoisedCells: number;
  /** 被并掉的碎色号数 */
  mergedRareColors: number;
  /** 因不可替代而保留的碎色号 */
  keptRareColors: string[];
  /** 限色移除的色号 */
  limitRemoved: string[];
  /** 去背景清掉的格数 */
  backgroundCleared: number;
}

export function generate(
  src: SourceImage,
  palette: Palette,
  options: GenerateOptions,
): GenerateResult {
  const { cols, rows } = options;
  if (cols <= 0 || rows <= 0) {
    throw new Error(`非法尺寸：${cols}×${rows}`);
  }

  const available = options.availableColors ?? palette.colors;
  if (available.length === 0) {
    throw new Error('可用色板为空。请至少选择一种颜色，或关闭「仅用我有的颜色」。');
  }

  // 1. 采样：把图像变成每格一个颜色
  const samples = sampleCells(src, cols, rows, options.sampleMode ?? 'auto');

  // 2. 匹配：在可用色这个输入域内量化
  const matchOptions: MatchOptions = {
    dither: options.dither ?? false,
    ditherAmount: options.ditherAmount ?? 1,
  };
  const matched = matchToPalette(samples, available, matchOptions);
  const { grid } = matched;
  let colors = matched.usedColors;

  // 匹配质量统计要在后续改动之前算，反映的是「色板对这张图的还原能力」
  let sumDelta = 0;
  let maxDelta = 0;
  let counted = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY_CELL) continue;
    const d = matched.deltaE[i]!;
    sumDelta += d;
    counted++;
    if (d > maxDelta) maxDelta = d;
  }

  // 3. 去背景（仅对无 alpha 的素材有意义）
  let backgroundCleared = 0;
  if (options.removeBackground) {
    backgroundCleared = removeBackground(
      grid,
      cols,
      rows,
      colors,
      options.backgroundTolerance ?? DEFAULT_BG_TOLERANCE,
    );
  }

  // 4. 降噪：消除孤立的一两格噪点
  const denoiseOptions = { ...DEFAULT_DENOISE, ...options.denoise };
  const denoisedCells = removeSmallRegions(grid, cols, rows, colors, denoiseOptions);

  // 5. 碎色治理：并掉只用几颗的色号
  const rare = mergeRareColors(grid, colors, denoiseOptions);

  // 6. 限色
  const limit = options.maxColors
    ? limitColors(grid, colors, options.maxColors)
    : { removed: [], maxDeltaE: 0 };

  // 7. 重新压缩调色板。前面几步会让部分色号彻底消失，
  //    不重压的话图例里会出现用量为 0 的行。
  colors = compact(grid, colors);

  const pattern: Pattern = {
    version: 1,
    specId: options.specId ?? `fuse-bead/${palette.id}`,
    size: { cols, rows },
    grid,
    palette: colors,
  };

  return {
    pattern,
    bom: computeBom(grid, colors),
    report: {
      averageDeltaE: counted > 0 ? Number((sumDelta / counted).toFixed(2)) : 0,
      maxDeltaE: Number(maxDelta.toFixed(2)),
      denoisedCells,
      mergedRareColors: rare.mergedColors,
      keptRareColors: rare.keptRare,
      limitRemoved: limit.removed,
      backgroundCleared,
    },
  };
}

/** 就地重编号，剔除不再使用的颜色 */
function compact(grid: Uint16Array, colors: PaletteColor[]): PaletteColor[] {
  const remap = new Map<number, number>();
  const out: PaletteColor[] = [];
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]!;
    if (v === EMPTY_CELL) continue;
    let next = remap.get(v);
    if (next === undefined) {
      out.push(colors[v - 1]!);
      next = out.length;
      remap.set(v, next);
    }
    grid[i] = next;
  }
  return out;
}
