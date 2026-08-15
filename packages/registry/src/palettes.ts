/**
 * 色卡加载。
 *
 * 全部走动态 import：单个色卡约 40-60KB，十套合计约 600KB。
 * 用户一次只用一个色卡，静态全量引入会把不相干的数据打进编辑器首屏包。
 * Vite / Astro 会据此自动做代码分割。
 */

import type { Palette } from './types.js';
import indexJson from '../data/index.json' with { type: 'json' };

/** 色卡元信息，列表页与选择器只需这份，不必加载完整色卡 */
export interface PaletteMeta {
  id: string;
  brand: string;
  version: string;
  count: number;
  confidence: { high: number; medium: number; low: number };
  unidentifiedCount: number;
  sets: number[];
  license: string;
}

export const PALETTE_INDEX = indexJson as PaletteMeta[];

const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  'mard-221': () => import('../data/mard-221.json'),
  'mard-291': () => import('../data/mard-291.json'),
  'coco-291': () => import('../data/coco-291.json'),
  'artkal-c197': () => import('../data/artkal-c197.json'),
  'artkal-m221': () => import('../data/artkal-m221.json'),
  perler: () => import('../data/perler.json'),
  hama: () => import('../data/hama.json'),
  'manman-278': () => import('../data/manman-278.json'),
  'panpan-289': () => import('../data/panpan-289.json'),
  'mixiaowo-290': () => import('../data/mixiaowo-290.json'),
};

export const PALETTE_IDS = Object.keys(loaders);

/**
 * MARD 221 是国内零售与图纸交流的事实标准，作为默认色卡。
 * 注意这不代表它数据最准——它恰恰是分歧最大的一个（见 confidence 分布），
 * 但产品必须对齐用户实际能买到的东西。
 */
export const DEFAULT_PALETTE_ID = 'mard-221';

const cache = new Map<string, Palette>();

export async function loadPalette(id: string): Promise<Palette> {
  const cached = cache.get(id);
  if (cached) return cached;

  const loader = loaders[id];
  if (!loader) {
    throw new Error(
      `未知色卡：${id}。可用色卡：${PALETTE_IDS.join(', ')}`,
    );
  }
  const mod = await loader();
  const palette = mod.default as Palette;
  cache.set(id, palette);
  return palette;
}

export function getPaletteMeta(id: string): PaletteMeta | undefined {
  return PALETTE_INDEX.find((p) => p.id === id);
}
