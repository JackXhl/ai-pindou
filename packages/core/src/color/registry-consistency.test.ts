import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hexToLab } from './convert.js';

/**
 * 防漂移测试。
 *
 * registry 的构建脚本里有一份独立的 JS 色彩数学实现（因为 registry 不依赖
 * 任何包是硬约束，而构建脚本跑在 Node 下、core 是 TS 源码）。同一套公式
 * 存在两份实现就有漂移风险：改了一边忘了另一边，色卡的 lab 会与运行时
 * 匹配用的转换不一致，表现是匹配结果轻微偏移——功能正常，只是选错豆，
 * 且几乎不可能靠肉眼评审发现。
 *
 * 这里逐条比对全部色卡的 lab 预计算值与 core 实现的结果，任何一处漂移都会失败。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'registry', 'data');

interface PaletteFile {
  id: string;
  colors: { code: string; hex: string; lab: [number, number, number] }[];
}

const files = readdirSync(DATA_DIR).filter(
  (f: string) => f.endsWith('.json') && f !== 'index.json',
);

describe('registry 的 lab 预计算与 core 实现一致', () => {
  it('色卡文件存在', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} 全部色号的 lab 与 core 计算结果一致`, () => {
      const palette = JSON.parse(
        readFileSync(join(DATA_DIR, file), 'utf8'),
      ) as PaletteFile;

      for (const color of palette.colors) {
        const expected = hexToLab(color.hex);
        for (let i = 0; i < 3; i++) {
          expect(
            Math.abs(expected[i]! - color.lab[i]!),
            `${palette.id} ${color.code} (${color.hex}) 第 ${i} 个分量漂移`,
          ).toBeLessThan(0.01);
        }
      }
    });
  }
});
