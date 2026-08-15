/**
 * 跨品牌色号换算：只走 HEX + CIEDE2000，禁止色号字面映射。
 *
 * COCO 与 MARD 291 曾出现「色号重合但颜色完全不同」的陷阱；
 * 任何按 code 字符串对齐的逻辑都会产出错误结果。
 */

import { deltaE2000, matchQuality, type Lab, type MatchQuality } from '@aipindou/core';
import type { Palette, PaletteColor } from '@aipindou/registry';

export interface ColorMatch {
  source: PaletteColor;
  target: PaletteColor;
  deltaE: number;
  quality: MatchQuality;
}

export function convertPalette(
  source: Palette,
  target: Palette,
): ColorMatch[] {
  const targetLabs = target.colors.map((c) => c.lab as Lab);
  const results: ColorMatch[] = [];

  for (const s of source.colors) {
    if (s.unidentified) continue;
    let best = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < target.colors.length; i++) {
      const d = deltaE2000(s.lab as Lab, targetLabs[i]!);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    results.push({
      source: s,
      target: target.colors[best]!,
      deltaE: Number(bestDelta.toFixed(2)),
      quality: matchQuality(bestDelta),
    });
  }

  return results;
}

/** 小色板损耗提示：源色卡有多少色在目标上只能落到 fair/poor */
export function lossSummary(matches: ColorMatch[]) {
  const risky = matches.filter((m) => m.quality === 'fair' || m.quality === 'poor');
  return {
    total: matches.length,
    risky: risky.length,
    riskyRatio: matches.length ? risky.length / matches.length : 0,
  };
}
