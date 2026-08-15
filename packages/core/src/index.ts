export * from './color/index.js';

export { generate } from './generate.js';
export type {
  GenerateOptions,
  GenerateReport,
  GenerateResult,
} from './generate.js';

export { computeBom } from './bom.js';
export type { Bom, BomEntry } from './bom.js';

export { EMPTY_CELL, matchToPalette } from './pipeline/match.js';
export type { MatchOptions, MatchResult } from './pipeline/match.js';

export { ALPHA_THRESHOLD, looksLikePixelArt, sampleCells } from './pipeline/sample.js';
export type { CellSamples, SampleMode } from './pipeline/sample.js';

export { resampleLanczos, toLinear } from './pipeline/resample.js';
export type { LinearImage, SourceImage } from './pipeline/resample.js';

export {
  DEFAULT_DENOISE,
  mergeRareColors,
  removeSmallRegions,
} from './pipeline/denoise.js';
export type { DenoiseOptions, MergeRareResult } from './pipeline/denoise.js';

export { DEFAULT_BG_TOLERANCE, removeBackground } from './pipeline/background.js';

export { limitColors } from './pipeline/limit.js';
export type { LimitResult } from './pipeline/limit.js';
