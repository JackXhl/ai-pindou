/**
 * 缺色三选一：对照图纸用料与「我的色板」，给出替代 / 补货 / 改图建议。
 * 替代色只在用户已有色号里找，跨色号一律走 HEX + ΔE。
 */

import {
  deltaE2000,
  matchQuality,
  type Bom,
  type Lab,
  type MatchQuality,
} from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';

export type ColorRole = 'background' | 'shadow' | 'decoration' | 'main';

/** 替换风险：背景最低 → 主色最高（做错主色最显眼） */
const ROLE_RISK: Record<ColorRole, number> = {
  background: 0,
  shadow: 1,
  decoration: 2,
  main: 3,
};

export interface SubstituteOption {
  color: PaletteColor;
  deltaE: number;
  quality: MatchQuality;
}

export interface MissingColorAdvice {
  missing: PaletteColor;
  gridValue: number;
  beads: number;
  bags: number;
  role: ColorRole;
  /** 风险分：越高越不建议随便替代 */
  risk: number;
  substitutes: SubstituteOption[];
}

export function classifyRole(
  entry: { beads: number; color: PaletteColor },
  totalBeads: number,
  maxBeads: number,
): ColorRole {
  const share = totalBeads > 0 ? entry.beads / totalBeads : 0;
  const L = entry.color.lab[0] ?? 50;
  if (share >= 0.28 || entry.beads >= maxBeads * 0.85) return 'main';
  if (L < 28 && share >= 0.08) return 'shadow';
  if (share >= 0.15 && L > 75) return 'background';
  if (share < 0.04 || entry.beads < 12) return 'decoration';
  if (L < 40) return 'shadow';
  return share >= 0.1 ? 'main' : 'decoration';
}

export function findSubstitutes(
  missing: PaletteColor,
  owned: PaletteColor[],
  limit = 3,
): SubstituteOption[] {
  const lab = missing.lab as Lab;
  const ranked = owned
    .filter((c) => c.code !== missing.code && !c.unidentified)
    .map((color) => {
      const deltaE = deltaE2000(lab, color.lab as Lab);
      return {
        color,
        deltaE: Number(deltaE.toFixed(2)),
        quality: matchQuality(deltaE),
      };
    })
    .sort((a, b) => a.deltaE - b.deltaE);
  return ranked.slice(0, limit);
}

/**
 * 图纸里有、我的色板没有的色号。
 * ownedCodes 为空时视为「尚未配置色板」，不报缺色（避免误伤）。
 */
export function analyzeMissingColors(
  bom: Bom,
  ownedCodes: string[] | null,
  ownedColors: PaletteColor[],
): MissingColorAdvice[] {
  if (!ownedCodes || ownedCodes.length === 0) return [];
  const owned = new Set(ownedCodes.map((c) => c.toUpperCase()));
  const maxBeads = bom.entries.reduce((m, e) => Math.max(m, e.beads), 0);

  const list: MissingColorAdvice[] = [];
  for (const entry of bom.entries) {
    if (owned.has(entry.color.code.toUpperCase())) continue;
    const role = classifyRole(entry, bom.totalBeads, maxBeads);
    list.push({
      missing: entry.color,
      gridValue: entry.gridValue,
      beads: entry.beads,
      bags: entry.bags,
      role,
      risk: ROLE_RISK[role],
      substitutes: findSubstitutes(entry.color, ownedColors),
    });
  }

  // 先处理低风险（背景/阴影），主色排后面让用户更谨慎
  return list.sort((a, b) => a.risk - b.risk || b.beads - a.beads);
}

export const ROLE_LABEL: Record<ColorRole, string> = {
  background: '背景',
  shadow: '阴影',
  decoration: '装饰',
  main: '主色',
};
