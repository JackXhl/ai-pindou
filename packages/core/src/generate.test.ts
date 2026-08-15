import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Palette } from '@aipindou/registry';
import { generate } from './generate.js';
import { EMPTY_CELL } from './pipeline/match.js';
import type { SourceImage } from './pipeline/resample.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPaletteSync(id: string): Palette {
  const file = join(__dirname, '..', '..', 'registry', 'data', `${id}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Palette;
}

const MARD = loadPaletteSync('mard-221');

/** 造一张纯色块测试图 */
function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number],
): SourceImage {
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

describe('生成管线端到端', () => {
  it('左右两色块生成两色图纸，尺寸与用量都对得上', () => {
    const img = makeImage(64, 64, (x) =>
      x < 32 ? [220, 30, 40, 255] : [30, 60, 200, 255],
    );

    const { pattern, bom } = generate(img, MARD, { cols: 32, rows: 32 });

    expect(pattern.size).toEqual({ cols: 32, rows: 32 });
    expect(pattern.grid.length).toBe(32 * 32);
    expect(pattern.palette.length).toBe(2);
    expect(bom.totalBeads).toBe(32 * 32);
    expect(bom.totalColors).toBe(2);
    // 两块面积相等
    expect(bom.entries[0]!.beads).toBe(512);
    expect(bom.entries[1]!.beads).toBe(512);
  });

  it('可用色是输入域：输出绝不会出现色板外的颜色', () => {
    const img = makeImage(64, 64, (x, y) => [
      (x * 4) % 256,
      (y * 4) % 256,
      ((x + y) * 2) % 256,
      255,
    ]);

    // 只给三种颜色
    const available = [
      MARD.colors.find((c) => c.code === 'H2')!,
      MARD.colors.find((c) => c.code === 'H7')!,
      MARD.colors.find((c) => c.code === 'A1')!,
    ];

    const { pattern } = generate(img, MARD, {
      cols: 24,
      rows: 24,
      availableColors: available,
      denoise: { minRegionSize: 0, minColorCount: 0 },
    });

    const allowed = new Set(available.map((c) => c.code));
    for (const color of pattern.palette) {
      expect(allowed.has(color.code)).toBe(true);
    }
    expect(pattern.palette.length).toBeLessThanOrEqual(3);
  });

  it('可用色为空时给出可操作的报错，而不是产出空图', () => {
    const img = makeImage(8, 8, () => [100, 100, 100, 255]);
    expect(() =>
      generate(img, MARD, { cols: 4, rows: 4, availableColors: [] }),
    ).toThrow(/至少选择一种颜色/);
  });

  it('透明区域成为空格，不计入用料', () => {
    const img = makeImage(32, 32, (x, y) =>
      // 左上四分之一透明
      x < 16 && y < 16 ? [0, 0, 0, 0] : [200, 50, 50, 255],
    );

    const { pattern, bom } = generate(img, MARD, { cols: 16, rows: 16 });

    let empty = 0;
    for (let i = 0; i < pattern.grid.length; i++) {
      if (pattern.grid[i] === EMPTY_CELL) empty++;
    }
    expect(empty).toBe(64);
    expect(bom.emptyCells).toBe(64);
    expect(bom.totalBeads).toBe(16 * 16 - 64);
  });

  it('BOM 的颗数合计等于非空格数，袋数按整袋向上取整', () => {
    const img = makeImage(60, 60, (x, y) => [
      (x * 8) % 256,
      (y * 8) % 256,
      128,
      255,
    ]);

    const { pattern, bom } = generate(img, MARD, { cols: 30, rows: 30 });

    let nonEmpty = 0;
    for (let i = 0; i < pattern.grid.length; i++) {
      if (pattern.grid[i] !== EMPTY_CELL) nonEmpty++;
    }
    const sum = bom.entries.reduce((s, e) => s + e.beads, 0);
    expect(sum).toBe(nonEmpty);
    expect(bom.totalBeads).toBe(nonEmpty);
    // 每种颜色至少要买一袋
    for (const e of bom.entries) expect(e.bags).toBeGreaterThanOrEqual(1);
    // 图例与实际使用的颜色一一对应
    expect(bom.entries.length).toBe(pattern.palette.length);
  });

  it('碎色治理会并掉零星色号，但保留无可替代的高光', () => {
    // 深色背景 + 中央两格纯白高光：白色用量极少却不可替代
    const img = makeImage(40, 40, (x, y) => {
      const inHighlight = y >= 18 && y < 20 && x >= 18 && x < 20;
      return inHighlight ? [255, 255, 255, 255] : [20, 20, 30, 255];
    });

    const { pattern, report } = generate(img, MARD, {
      cols: 20,
      rows: 20,
      sampleMode: 'dominant',
      denoise: { minRegionSize: 0, minColorCount: 4, maxMergeDeltaE: 12 },
    });

    // 高光只占 1 格，低于碎色阈值，但与深色底色差远超容差，必须保留
    expect(report.keptRareColors.length).toBeGreaterThan(0);
    expect(pattern.palette.length).toBeGreaterThanOrEqual(2);
  });

  it('限色能把色号数压到上限以内', () => {
    const img = makeImage(80, 80, (x, y) => [
      (x * 3) % 256,
      (y * 5) % 256,
      ((x * y) / 4) % 256,
      255,
    ]);

    const { pattern, report } = generate(img, MARD, {
      cols: 40,
      rows: 40,
      maxColors: 8,
      denoise: { minRegionSize: 0, minColorCount: 0 },
    });

    expect(pattern.palette.length).toBeLessThanOrEqual(8);
    expect(report.limitRemoved.length).toBeGreaterThan(0);
  });

  it('报告如实给出匹配色差', () => {
    const img = makeImage(32, 32, () => [123, 87, 200, 255]);
    const { report } = generate(img, MARD, { cols: 16, rows: 16 });

    expect(report.averageDeltaE).toBeGreaterThanOrEqual(0);
    expect(report.maxDeltaE).toBeGreaterThanOrEqual(report.averageDeltaE);
  });
});
