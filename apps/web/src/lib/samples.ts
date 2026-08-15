/**
 * 静态精选样例。数据在 public/samples/，由 scripts/generate-samples.ts 生成。
 */

import { computeBom } from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';

export interface SampleMeta {
  id: string;
  title: string;
  tag: string;
  featured: boolean;
  cols: number;
  rows: number;
  totalBeads: number;
  totalColors: number;
}

export interface SamplePattern extends SampleMeta {
  paletteId: string;
  colors: PaletteColor[];
  grid: number[];
}

let catalogCache: SampleMeta[] | null = null;

function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${relative}`.replace(/([^:]\/)\/+/g, '$1');
}

export async function listSamples(): Promise<SampleMeta[]> {
  if (catalogCache) return catalogCache;
  const res = await fetch(assetUrl('samples/index.json'));
  if (!res.ok) throw new Error('无法加载样例列表');
  catalogCache = (await res.json()) as SampleMeta[];
  return catalogCache;
}

export async function loadSample(id: string): Promise<SamplePattern> {
  const res = await fetch(assetUrl(`samples/${id}.json`));
  if (!res.ok) throw new Error(`样例不存在：${id}`);
  return (await res.json()) as SamplePattern;
}

/** 把样例灌进编辑器（等价于 Remix，但纯静态、无上传） */
export function applySampleToEditor(data: SamplePattern) {
  const grid = new Uint16Array(data.grid);
  const colors = data.colors as PaletteColor[];
  const bom = computeBom(grid, colors);
  return { grid, colors, bom, cols: data.cols, rows: data.rows, paletteId: data.paletteId };
}

export function editorSampleUrl(id: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const path = `${base}editor/?sample=${encodeURIComponent(id)}`.replace(/\/{2,}/g, '/');
  return path.startsWith('/') ? path : `/${path}`;
}

/** 在 canvas 上画缩略图 */
export function drawSamplePreview(
  canvas: HTMLCanvasElement,
  grid: Uint16Array | number[],
  cols: number,
  rows: number,
  colors: PaletteColor[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cell = Math.max(1, Math.floor(Math.min(canvas.width / cols, canvas.height / rows)));
  const w = cols * cell;
  const h = rows * cell;
  const ox = Math.floor((canvas.width - w) / 2);
  const oy = Math.floor((canvas.height - h) / 2);
  ctx.fillStyle = '#f5f3f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r * cols + c] ?? 0;
      if (v === 0) continue;
      const color = colors[v - 1];
      if (!color) continue;
      ctx.fillStyle = color.hex.slice(0, 7);
      ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
    }
  }
}
