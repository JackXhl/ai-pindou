export type {
  BeadUnit,
  BoardPreset,
  CellState,
  Confidence,
  CraftProgress,
  CraftSpec,
  Finish,
  Palette,
  PaletteColor,
  PaletteSet,
  Pattern,
  SizePreset,
} from './types.js';

export { CELL_STATE } from './types.js';

export {
  BEAD_UNITS,
  BEADS_PER_BAG,
  BOARD_PRESETS,
  DEFAULT_BOARD,
  DEFAULT_UNIT_ID,
  SIZE_PRESETS,
  WASTAGE_RATIO,
  beadsToBags,
  boardCount,
  describeSize,
  gridToCm,
  makeCraftSpec,
} from './specs.js';

export type { BeadUnitId, SizeDescription } from './specs.js';

export {
  DEFAULT_PALETTE_ID,
  PALETTE_IDS,
  PALETTE_INDEX,
  getPaletteMeta,
  loadPalette,
} from './palettes.js';

export type { PaletteMeta } from './palettes.js';
