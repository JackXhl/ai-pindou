/**
 * 生成精选样例图纸 JSON。
 * 运行：pnpm exec tsx scripts/generate-samples.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../packages/core/src/generate.ts';
import type { Palette } from '../packages/registry/src/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../apps/web/public/samples');

function loadPalette(id: string): Palette {
  const file = join(__dirname, `../packages/registry/data/${id}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Palette;
}

function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a;
    }
  }
  return { width, height, data };
}

function heartImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const nx = (x / (size - 1)) * 2 - 1;
    const ny = (y / (size - 1)) * 2 - 1.1;
    const v = (nx * nx + ny * ny - 0.3) ** 3 - nx * nx * ny * ny * ny;
    if (v <= 0) return [220, 40, 60, 255];
    return [255, 250, 248, 255];
  });
}

function smileyImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d > cx * 0.92) return [255, 210, 50, 255];
    if (d > cx * 0.78) return [40, 40, 40, 255];
    const eyeL = Math.hypot(x - cx * 0.65, y - cy * 0.75);
    const eyeR = Math.hypot(x - cx * 1.35, y - cy * 0.75);
    if (eyeL < cx * 0.12 || eyeR < cx * 0.12) return [40, 40, 40, 255];
    if (y > cy * 1.15 && y < cy * 1.35 && Math.abs(x - cx) < cx * 0.45) {
      return [40, 40, 40, 255];
    }
    return [255, 210, 50, 255];
  });
}

function mushroomImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const stemW = size * 0.22;
    if (Math.abs(x - cx) < stemW && y > size * 0.55) return [245, 235, 210, 255];
    const capY = size * 0.45;
    const capR = size * 0.42;
    if (Math.hypot(x - cx, y - capY) < capR) {
      if (Math.hypot(x - cx * 0.75, y - capY * 0.85) < size * 0.08) return [255, 255, 255, 255];
      if (Math.hypot(x - cx * 1.25, y - capY * 0.95) < size * 0.07) return [255, 255, 255, 255];
      if (Math.hypot(x - cx, y - capY * 0.7) < size * 0.06) return [255, 255, 255, 255];
      return [220, 50, 45, 255];
    }
    return [180, 220, 255, 255];
  });
}

function starImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const ang = Math.atan2(y - cy, x - cx);
    const dist = Math.hypot(x - cx, y - cy);
    const spikes = 5;
    const outer = size * 0.42;
    const inner = size * 0.18;
    const mod = ((ang + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    const sector = mod * spikes;
    const t = sector - Math.floor(sector);
    const r = t < 0.5 ? outer : inner + (outer - inner) * (1 - (t - 0.5) * 2);
    if (dist < r) return [255, 200, 40, 255];
    return [30, 40, 80, 255];
  });
}

function cherryImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const c1 = { x: size * 0.38, y: size * 0.62, r: size * 0.18 };
    const c2 = { x: size * 0.62, y: size * 0.68, r: size * 0.17 };
    const d1 = Math.hypot(x - c1.x, y - c1.y);
    const d2 = Math.hypot(x - c2.x, y - c2.y);
    if (d1 < c1.r || d2 < c2.r) return [200, 25, 45, 255];
    const stemX = size * 0.5;
    if (Math.abs(x - stemX) < 2 && y < size * 0.35) return [60, 120, 50, 255];
    if (Math.hypot(x - size * 0.35, y - size * 0.32) < 3) return [60, 120, 50, 255];
    return [255, 252, 248, 255];
  });
}

function cloverImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const leaves: [number, number][] = [
      [size * 0.35, size * 0.35],
      [size * 0.65, size * 0.35],
      [size * 0.35, size * 0.65],
      [size * 0.65, size * 0.65],
    ];
    for (const [lx, ly] of leaves) {
      if (Math.hypot(x - lx, y - ly) < size * 0.16) return [50, 160, 70, 255];
    }
    if (Math.abs(x - size * 0.5) < 3 && y > size * 0.45) return [50, 120, 40, 255];
    return [240, 248, 240, 255];
  });
}

function catImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size / 2;
    const faceR = size * 0.32;
    if (Math.hypot(x - cx, y - cy) < faceR) {
      const eyeL = Math.hypot(x - cx * 0.75, y - cy * 0.85);
      const eyeR = Math.hypot(x - cx * 1.25, y - cy * 0.85);
      if (eyeL < size * 0.05 || eyeR < size * 0.05) return [30, 30, 30, 255];
      if (Math.abs(x - cx) < 3 && y > cy * 1.05 && y < cy * 1.15) return [255, 160, 180, 255];
      return [255, 180, 100, 255];
    }
    if (y < cy * 0.55 && x < cx * 0.7 && Math.hypot(x - cx * 0.55, y - cy * 0.45) < size * 0.12)
      return [255, 180, 100, 255];
    if (y < cy * 0.55 && x > cx * 1.3 && Math.hypot(x - cx * 1.45, y - cy * 0.45) < size * 0.12)
      return [255, 180, 100, 255];
    return [255, 240, 230, 255];
  });
}

function rainbowImage(w: number, h: number) {
  return makeImage(w, h, (x) => {
    const t = x / (w - 1);
    const hue = t * 300;
    const s = 0.85;
    const l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = hue / 60;
    const x2 = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) [r, g, b] = [c, x2, 0];
    else if (hp < 2) [r, g, b] = [x2, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x2];
    else if (hp < 4) [r, g, b] = [0, x2, c];
    else if (hp < 5) [r, g, b] = [x2, 0, c];
    else [r, g, b] = [c, 0, x2];
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
      255,
    ];
  });
}

const MARD = loadPalette('mard-221');

const catalog = [
  { id: 'heart-29', title: '像素爱心', tag: '入门', featured: true, image: () => heartImage(58), opts: { cols: 29, rows: 29, simplify: 25, maxColors: 8 } },
  { id: 'smiley-29', title: '经典笑脸', tag: '入门', featured: true, image: () => smileyImage(58), opts: { cols: 29, rows: 29, simplify: 30, maxColors: 10 } },
  { id: 'mushroom-29', title: '像素小蘑菇', tag: '可爱', featured: true, image: () => mushroomImage(58), opts: { cols: 29, rows: 29, simplify: 28, maxColors: 12 } },
  { id: 'star-29', title: '五角星', tag: '入门', featured: true, image: () => starImage(58), opts: { cols: 29, rows: 29, simplify: 20, maxColors: 8 } },
  { id: 'cherry-29', title: '樱桃', tag: '可爱', featured: false, image: () => cherryImage(58), opts: { cols: 29, rows: 29, simplify: 25, maxColors: 10 } },
  { id: 'clover-29', title: '四叶草', tag: '可爱', featured: false, image: () => cloverImage(58), opts: { cols: 29, rows: 29, simplify: 22, maxColors: 8 } },
  { id: 'cat-58', title: '像素猫脸', tag: '进阶', featured: true, image: () => catImage(116), opts: { cols: 58, rows: 58, simplify: 35, maxColors: 16 } },
  { id: 'rainbow-58', title: '彩虹条', tag: '渐变', featured: false, image: () => rainbowImage(116, 58), opts: { cols: 58, rows: 29, simplify: 10, maxColors: 24, dither: true } },
];

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
