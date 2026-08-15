import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Palette } from '@aipindou/registry';
import { generate } from './generate.js';
import type { SourceImage } from './pipeline/resample.js';

/**
 * 标准测试图 × 默认 Spec 快照：防止管线回归悄悄改掉配色结果。
 * 更新快照前请肉眼确认是预期变更：`pnpm --filter @aipindou/core test -u`
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPaletteSync(id: string): Palette {
  const file = join(__dirname, '..', '..', 'registry', 'data', `${id}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Palette;
}

const MARD = loadPaletteSync('mard-221');

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

/** 稳定、可读的快照载荷：色号序列 + 格值串 */
function snapshotPayload(result: ReturnType<typeof generate>) {
  return {
    cols: result.pattern.size.cols,
    rows: result.pattern.size.rows,
    codes: result.pattern.palette.map((c) => c.code),
    grid: Array.from(result.pattern.grid),
    totalBeads: result.bom.totalBeads,
    totalColors: result.bom.totalColors,
    averageDeltaE: result.report.averageDeltaE,
  };
}

describe('生成快照（默认 Spec）', () => {
  it('红蓝对半 29×29 · MARD221 · 默认参数', () => {
    const img = makeImage(58, 58, (x) =>
      x < 29 ? [220, 30, 40, 255] : [30, 60, 200, 255],
    );
    const result = generate(img, MARD, {
      cols: 29,
      rows: 29,
      sampleMode: 'auto',
      dither: false,
      maxColors: 0,
      denoise: { minRegionSize: 1, minColorCount: 3, maxMergeDeltaE: 10 },
    });
    expect(snapshotPayload(result)).toMatchSnapshot();
  });

  it('渐变条 58×58 · MARD221 · 限色 12', () => {
    const img = makeImage(116, 32, (x) => {
      const t = x / 115;
      return [
        Math.round(255 * (1 - t)),
        Math.round(80 + 100 * t),
        Math.round(255 * t),
        255,
      ];
    });
    const result = generate(img, MARD, {
      cols: 58,
      rows: 16,
      sampleMode: 'smooth',
      dither: false,
      maxColors: 12,
      denoise: { minRegionSize: 1, minColorCount: 2, maxMergeDeltaE: 10 },
    });
    expect(snapshotPayload(result)).toMatchSnapshot();
  });
});
