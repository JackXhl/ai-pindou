/**
 * 核心类型定义。
 *
 * 依赖方向严格单向：web → core → registry，registry 不依赖任何东西。
 * core 中禁止出现品牌名与豆径字面量，所有差异一律由 CraftSpec 传入。
 */

/** 数据可信度。多源交叉比对的结果，投票前必须先剔除重复数据源。 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * 豆子的材质/质感。
 *
 * 必须独立于 hex 而非并入其中：上游数据集把透明、夜光、闪粉、珠光一律压成
 * 单一 HEX，导致同一 HEX 对应两个不同实物豆（实测 Artkal 2 组、
 * Artkal Mini 1 组、MARD 291 1 组）。若沿用那种表达，颜色匹配会在这些
 * 色号上产生无法消歧的二义结果。
 */
export type Finish =
  | 'normal'
  | 'transparent'
  | 'glow'
  | 'glitter'
  | 'pearl'
  | 'fluorescent';

export interface PaletteColor {
  /** 品牌色号，如 'A01'、'H2'、'MA1' */
  code: string;
  /**
   * 颜色名。COCO 与 MARD 无官方色名，上游 1406 条中有 512 条 name 即 code，
   * 因此 UI 不能假设这里一定是人类可读的名字。
   */
  name: string;
  /** 透明色用 #RRGGBBAA 八位表达，不可退化为六位 */
  hex: string;
  /** 构建期预计算，避免运行时重复转换 */
  lab: [number, number, number];
  finish?: Finish;
  confidence: Confidence;
  /** 数据来源标识，便于追溯与纠错 */
  sources: string[];
  /**
   * 上游无法确认真实品牌色号者置位。
   * 必须原样透传到 UI，让用户知道该色不可靠，而不是悄悄用相近色顶替。
   */
  unidentified?: boolean;
  /** 多源分歧的最大 ΔE00。用于在 UI 上给出视觉警示。 */
  maxDeltaE?: number;
}

/**
 * 套装分档：用户实际能买到的色数组合。
 *
 * 重要的数据诚实性约束：市面只能证实**档位存在**（24/48/72… 的累加规则来自
 * 义乌①至⑥号色盘），但**每档具体包含哪些色号并无公开可靠数据**，且商家组合
 * 不必然是完整色号库的连续子集。
 *
 * 因此这里绝不猜测填充 codes。codesKnown 为 false 时 codes 必须为空数组，
 * UI 应引导用户手动勾选或导入自己的色号清单，而不是假装知道。
 */
export interface PaletteSet {
  /** 档位色数，如 24、48、221 */
  count: number;
  /** 该档包含的色号。codesKnown 为 false 时恒为空数组。 */
  codes: string[];
  /** 该档的色号构成是否有可靠数据支撑 */
  codesKnown: boolean;
  /** 档位来源说明，如「义乌①号色盘」 */
  note?: string;
}

export interface Palette {
  id: string;
  /** 品牌显示名 */
  brand: string;
  /** 色卡版本，必须打印在图纸上供用户核对商家色卡 */
  version: string;
  colors: PaletteColor[];
  sets: PaletteSet[];
  /** 数据来源与许可说明，CC BY 4.0 要求署名 */
  attribution: {
    sources: string[];
    license: string;
    notice?: string;
  };
}

/** 底板预设。底板数是拼豆用户真正的决策依据。 */
export interface BoardPreset {
  id: string;
  cols: number;
  rows: number;
  label: string;
}

/** 豆径规格。与色卡完全解耦，同一色卡可配多种豆径。 */
export interface BeadUnit {
  /** 单颗豆的直径（毫米）。国内主流是 2.6mm 而非 5mm。 */
  widthMm: number;
  shape: 'circle' | 'square';
  hasHole: boolean;
  label: string;
}

/** 描述一种可制作的物理媒介 */
export interface CraftSpec {
  /** 如 'fuse-bead/mard-221@2.6mm' */
  id: string;
  unit: BeadUnit;
  paletteId: string;
  board: {
    topology: 'square';
    presets: BoardPreset[];
  };
}

/** 尺寸预设。必须同时给豆数、厘米、底板数三个口径，绝不用隐喻命名。 */
export interface SizePreset {
  id: string;
  cols: number;
  rows: number;
}

/**
 * 图纸：唯一的中间数据结构，编辑器与导出都只认它。
 *
 * grid 用 Uint16Array 而非二维数组，58×58 仅 6.7KB，
 * 可直接进 IndexedDB 与 Worker 传输。
 */
export interface Pattern {
  version: 1;
  specId: string;
  size: { cols: number; rows: number };
  /** 索引到调色板的 colors 数组；0 表示空格 */
  grid: Uint16Array;
  /** grid 中实际用到的颜色，索引即 grid 的取值（第 0 位为空格占位） */
  palette: PaletteColor[];
}

/**
 * 摆豆进度。与 Pattern 分离存储：重置进度不影响图纸，编辑图纸也不必然作废进度。
 */
export interface CraftProgress {
  patternId: string;
  /**
   * 每格一字节，非布尔。
   * 0 未做 / 1 已完成 / 2 待返工 / 3 缺料跳过 / 4+ 预留
   *
   * 真实项目总会超出预设的两态模型——十字绣用户会自发挪用「挂线」标记来
   * 表达「半完成」，拼豆对应的是摆好未熨烫、摆错待改、缺料先跳过。
   * 预留状态位的成本几乎为零，事后补则要迁移全部用户数据。
   */
  cells: Uint8Array;
  /** 必须留存历史而非每日清零，否则用户会被迫自建 Excel 补记录 */
  dailyStats: { date: string; count: number; durationMs: number }[];
  /** 中断恢复用 */
  cursor?: { boardIndex: number; row: number };
  updatedAt: number;
}

/** 格子状态枚举，与 CraftProgress.cells 的取值对应 */
export const CELL_STATE = {
  TODO: 0,
  DONE: 1,
  REWORK: 2,
  SKIPPED_NO_STOCK: 3,
} as const;

export type CellState = (typeof CELL_STATE)[keyof typeof CELL_STATE];
