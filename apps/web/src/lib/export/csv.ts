import type { Bom } from '@aipindou/core';
import { stampFilename, downloadBlob } from './download.js';

/**
 * 导出用料清单为 CSV。
 *
 * 带 UTF-8 BOM，Excel 才能正确识别中文；否则打开会是乱码。
 * 袋数口径与页面一致，并在备注行写明估算假设。
 */
export function bomToCsv(bom: Bom, meta: { paletteVersion: string; sizeLabel: string }): string {
  const lines: string[] = [];
  lines.push('色号,颜色名,HEX,颗数,袋数,占比%');
  for (const e of bom.entries) {
    const name = e.color.name === e.color.code ? '' : e.color.name;
    lines.push(
      [
        e.color.code,
        csvEscape(name),
        e.color.hex,
        String(e.beads),
        String(e.bags),
        String(e.share),
      ].join(','),
    );
  }
  lines.push('');
  lines.push(`合计色号,${bom.totalColors}`);
  lines.push(`合计颗数,${bom.totalBeads}`);
  lines.push(`合计袋数,${bom.totalBags}`);
  lines.push(`尺寸,${csvEscape(meta.sizeLabel)}`);
  lines.push(`色卡,${csvEscape(meta.paletteVersion)}`);
  lines.push(
    `备注,袋数按每袋约 ${bom.assumptions.beadsPerBag} 粒、含 ${Math.round(bom.assumptions.wastageRatio * 100)}% 损耗估算；屏幕色与实物豆有色差，请以商家色卡为准`,
  );
  return `\uFEFF${lines.join('\r\n')}`;
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadBomCsv(
  bom: Bom,
  meta: { paletteVersion: string; sizeLabel: string; basename?: string },
): void {
  const csv = bomToCsv(bom, meta);
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    stampFilename(meta.basename ?? '用料清单', 'csv'),
  );
}
