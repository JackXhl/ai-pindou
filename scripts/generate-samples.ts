/**
 * 生成精选样例图纸 JSON。
 * 运行：pnpm exec tsx scripts/generate-samples.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../packages/core/src/generate.ts';
import type { Palette } from '../packages/registry/src/types.ts';
import { catalog } from './sample-painters.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../apps/web/public/samples');

function loadPalette(id: string): Palette {
  const file = join(__dirname, `../packages/registry/data/${id}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Palette;
}

const MARD = loadPalette('mard-221');

mkdirSync(outDir, { recursive: true });

const index: {
  id: string;
  title: string;
  tag: string;
  featured: boolean;
  cols: number;
  rows: number;
  totalBeads: number;
  totalColors: number;
}[] = [];

for (const item of catalog) {
  const img = item.image();
  const s = item.opts.simplify ?? 30;
  const denoise = {
    minRegionSize: Math.round((s / 100) * 3),
    minColorCount: Math.round((s / 100) * 10),
    maxMergeDeltaE: 6 + (s / 100) * 12,
  };
  const { pattern, bom } = generate(img, MARD, {
    cols: item.opts.cols,
    rows: item.opts.rows,
    sampleMode: 'auto',
    dither: item.opts.dither ?? false,
    maxColors: item.opts.maxColors ?? 0,
    denoise,
  });

  const payload = {
    id: item.id,
    title: item.title,
    tag: item.tag,
    paletteId: 'mard-221',
    cols: pattern.size.cols,
    rows: pattern.size.rows,
    colors: pattern.palette.map((c) => ({
      code: c.code,
      name: c.name,
      hex: c.hex,
      lab: [...c.lab] as [number, number, number],
    })),
    grid: Array.from(pattern.grid),
    totalBeads: bom.totalBeads,
    totalColors: bom.totalColors,
  };

  writeFileSync(join(outDir, `${item.id}.json`), JSON.stringify(payload));
  index.push({
    id: item.id,
    title: item.title,
    tag: item.tag,
    featured: item.featured,
    cols: payload.cols,
    rows: payload.rows,
    totalBeads: payload.totalBeads,
    totalColors: payload.totalColors,
  });
  console.log(`✓ ${item.id}  ${payload.cols}×${payload.rows}  ${payload.totalColors}色`);
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\n已写入 ${index.length} 个样例 → apps/web/public/samples/`);
