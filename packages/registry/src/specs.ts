/**
 * 豆径规格、底板预设与尺寸换算。
 *
 * 核心约束：**豆径与色卡是两个独立维度，绝不能绑死。**
 * 国内主流是 2.6mm 融合豆而非国际通行的 5mm，绑死会算错物理尺寸，
 * 进而算错底板数——而底板数是拼豆用户真正的采购决策依据。
 */

import type { BeadUnit, BoardPreset, CraftSpec, SizePreset } from './types.js';

/**
 * 豆径规格。
 *
 * 2.6mm 为默认：中文圈线下门店与电商爆款主流是 2.6mm 融合豆，
 * 与英文工具的默认（5mm midi）相反。
 */
export const BEAD_UNITS = {
  '2.6mm': {
    widthMm: 2.6,
    shape: 'circle',
    hasHole: true,
    label: '2.6mm 迷你豆',
  },
  '5mm': {
    widthMm: 5,
    shape: 'circle',
    hasHole: true,
    label: '5mm 中豆',
  },
} as const satisfies Record<string, BeadUnit>;

export type BeadUnitId = keyof typeof BEAD_UNITS;

export const DEFAULT_UNIT_ID: BeadUnitId = '2.6mm';

/**
 * 底板预设。
 *
 * 29×29 是 2.6mm 与 5mm 方形底板的通行规格，属物理约束：
 * 超出单板尺寸就必须分板拼接，这直接决定用户要买几块板。
 */
export const BOARD_PRESETS: BoardPreset[] = [
  { id: '29x29', cols: 29, rows: 29, label: '29×29 方板（通用）' },
  { id: '52x52', cols: 52, rows: 52, label: '52×52 大板' },
];

export const DEFAULT_BOARD = BOARD_PRESETS[0]!;

/**
 * 尺寸预设。
 *
 * 绝不使用「小杯 / 中杯 / 大杯」这类隐喻命名——竞品这么做且不给 tooltip，
 * 用户必须先点下去才知道自己做了多大。每档都必须能同时给出
 * 豆数、厘米、底板数三个口径（见 describeSize）。
 */
export const SIZE_PRESETS: SizePreset[] = [
  { id: '29x29', cols: 29, rows: 29 },
  { id: '58x58', cols: 58, rows: 58 },
  { id: '87x87', cols: 87, rows: 87 },
  { id: '116x116', cols: 116, rows: 116 },
];

/** 单格边长换算成厘米 */
export function gridToCm(count: number, unit: BeadUnit): number {
  return (count * unit.widthMm) / 10;
}

/** 底板数：宽高分别向上取整后相乘 */
export function boardCount(
  cols: number,
  rows: number,
  board: BoardPreset = DEFAULT_BOARD,
): number {
  return Math.ceil(cols / board.cols) * Math.ceil(rows / board.rows);
}

export interface SizeDescription {
  cols: number;
  rows: number;
  beads: number;
  widthCm: number;
  heightCm: number;
  boards: number;
}

/**
 * 把一个尺寸同时表达成三个口径。
 * UI 上必须三者并列展示，例如「58×58 · 15.1×15.1cm · 4 块底板」。
 */
export function describeSize(
  cols: number,
  rows: number,
  unit: BeadUnit,
  board: BoardPreset = DEFAULT_BOARD,
): SizeDescription {
  return {
    cols,
    rows,
    beads: cols * rows,
    widthCm: Number(gridToCm(cols, unit).toFixed(1)),
    heightCm: Number(gridToCm(rows, unit).toFixed(1)),
    boards: boardCount(cols, rows, board),
  };
}

/**
 * 采购换算：把颗数换算成「袋」。
 *
 * 用户的实际下单单位是 10g 约 1000 粒的袋（约 ¥0.7-0.9，1 袋起购），
 * 只输出「需 156 颗」等于把换算工作丢回给用户。
 */
export const BEADS_PER_BAG = 1000;
/** 摆豆有损耗（掉落、烫坏、试色），按 10% 冗余 */
export const WASTAGE_RATIO = 0.1;

export function beadsToBags(
  beads: number,
  { perBag = BEADS_PER_BAG, wastage = WASTAGE_RATIO } = {},
): number {
  return Math.ceil((beads * (1 + wastage)) / perBag);
}

/** 组合出一个可制作媒介的完整规格 */
export function makeCraftSpec(paletteId: string, unitId: BeadUnitId): CraftSpec {
  return {
    id: `fuse-bead/${paletteId}@${unitId}`,
    unit: BEAD_UNITS[unitId],
    paletteId,
    board: { topology: 'square', presets: BOARD_PRESETS },
  };
}
