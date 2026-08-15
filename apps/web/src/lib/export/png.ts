import { contrastTextColor, hexToRgb, type Bom } from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';
import { downloadBlob, stampFilename } from './download.js';

export type PngMode = 'color' | 'codes' | 'both';

export interface PngExportInput {
  grid: Uint16Array;
  cols: number;
  rows: number;
  colors: PaletteColor[];
  bom: Bom;
  mode?: PngMode;
  /** 每格像素边长 */
  cellPx?: number;
  title?: string;
  sizeLabel: string;
  paletteVersion: string;
  beadSizeLabel: string;
  /** 物理豆径 mm，用于 1cm 校准条 */
  beadWidthMm?: number;
  mirrored?: boolean;
  basename?: string;
}

const EMPTY = 0;
const DISCLAIMER =
  '屏幕色与实物豆有色差；色卡数据来自公开整理，非厂商官方。下单请以商家色卡为准。仅供个人制作。';

/** 把图纸渲染成离屏画布（含页眉、图例、免责） */
export function renderPatternCanvas(input: PngExportInput): HTMLCanvasElement {
  const {
    grid,
    cols,
    rows,
    colors,
    bom,
    mode = 'both',
    cellPx = 18,
    title = '爱拼豆图纸',
    sizeLabel,
    paletteVersion,
    beadSizeLabel,
    mirrored = false,
    beadWidthMm = 2.6,
  } = input;

  const showFill = mode === 'color' || mode === 'both';
  const showCodes = mode === 'codes' || mode === 'both';

  const legendCols = 4;
  const legendRowH = 22;
  const legendRows = Math.ceil(bom.entries.length / legendCols);
  const headerH = 96;
  const footerH = 56;
  const legendH = 28 + legendRows * legendRowH + 12;
  const pad = 24;
  const gridW = cols * cellPx;
  const gridH = rows * cellPx;
  const boardStep = 29;
  const boardCols = Math.ceil(cols / boardStep);
  const boardRows = Math.ceil(rows / boardStep);

  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + Math.max(gridW, legendCols * 160);
  canvas.height = pad + headerH + gridH + 16 + legendH + footerH + pad;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建导出画布');

  // 白底：打印友好
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 20px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, pad, pad + 22);
  ctx.font = '13px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#555555';
  ctx.fillText(
    `${sizeLabel} · ${beadSizeLabel} · 色卡版本 ${paletteVersion}${mirrored ? ' · 【镜像版】' : ''}`,
    pad,
    pad + 44,
  );
  ctx.fillStyle = mirrored ? '#b45309' : '#666666';
  ctx.font = '12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(
    mirrored
      ? '镜像标识：胶带法翻面后与实物同向 · 分板按 29×29 编号见格区角标'
      : `分板示意：约 ${boardCols}×${boardRows} 块底板（每块 29×29）· 角标为板号`,
    pad,
    pad + 64,
  );

  // 1cm 校准条：按豆径换算像素，打印「实际大小」时应接近 1 厘米
  const cmPx = (10 / beadWidthMm) * cellPx;
  const barY = pad + 72;
  ctx.fillStyle = '#111111';
  ctx.fillRect(pad, barY, cmPx, 6);
  ctx.fillStyle = '#444444';
  ctx.font = '11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('校准条 = 1 cm（请用尺子核对；偏差大请检查打印缩放）', pad + cmPx + 8, barY + 6);

  const originX = pad;
  const originY = pad + headerH;

  // 色块
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcC = mirrored ? cols - 1 - c : c;
      const value = grid[r * cols + srcC]!;
      const x = originX + c * cellPx;
      const y = originY + r * cellPx;
      if (value === EMPTY) {
        // 空格画浅棋盘，便于对格
        ctx.fillStyle = (c + r) % 2 === 0 ? '#f3f3f3' : '#eaeaea';
        ctx.fillRect(x, y, cellPx, cellPx);
        continue;
      }
      const color = colors[value - 1]!;
      if (showFill) {
        ctx.fillStyle = color.hex.length >= 7 ? color.hex.slice(0, 7) : color.hex;
        ctx.fillRect(x, y, cellPx, cellPx);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, cellPx, cellPx);
      }
    }
  }

  // 网格线
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    const x = originX + c * cellPx + 0.5;
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + gridH);
  }
  for (let r = 0; r <= rows; r++) {
    const y = originY + r * cellPx + 0.5;
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + gridW, y);
  }
  ctx.stroke();

  // 底板粗线（29）+ 分板编号
  const major = 29;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let c = 0; c <= cols; c += major) {
    const x = originX + c * cellPx + 0.5;
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + gridH);
  }
  for (let r = 0; r <= rows; r += major) {
    const y = originY + r * cellPx + 0.5;
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + gridW, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.font = `bold ${Math.max(10, Math.floor(cellPx * 0.7))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let br = 0; br < boardRows; br++) {
    for (let bc = 0; bc < boardCols; bc++) {
      const label = `${br + 1}-${bc + 1}`;
      ctx.fillText(label, originX + bc * major * cellPx + 4, originY + br * major * cellPx + 4);
    }
  }

  // 色号文字
  if (showCodes && cellPx >= 12) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(7, Math.floor(cellPx * 0.42))}px ui-monospace, Consolas, monospace`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const srcC = mirrored ? cols - 1 - c : c;
        const value = grid[r * cols + srcC]!;
        if (value === EMPTY) continue;
        const color = colors[value - 1]!;
        const rgb = hexToRgb(color.hex);
        ctx.fillStyle = showFill ? contrastTextColor(rgb) : '#111111';
        ctx.fillText(
          color.code,
          originX + (c + 0.5) * cellPx,
          originY + (r + 0.5) * cellPx,
        );
      }
    }
  }

  // 图例
  const legendY = originY + gridH + 28;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 14px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(
    `用料清单 · ${bom.totalColors} 色 · ${bom.totalBeads} 颗 · 约 ${bom.totalBags} 袋`,
    pad,
    legendY,
  );

  const colW = Math.floor((canvas.width - pad * 2) / legendCols);
  bom.entries.forEach((entry, i) => {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const x = pad + col * colW;
    const y = legendY + 10 + row * legendRowH;
    ctx.fillStyle = entry.color.hex.slice(0, 7);
    ctx.fillRect(x, y, 14, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeRect(x + 0.5, y + 0.5, 13, 13);
    ctx.fillStyle = '#222';
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillText(
      `${entry.color.code}  ${entry.beads}颗/${entry.bags}袋`,
      x + 20,
      y + 12,
    );
  });

  // 免责
  const footY = canvas.height - pad - 28;
  ctx.fillStyle = '#666666';
  ctx.font = '11px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(ctx, DISCLAIMER, pad, footY, canvas.width - pad * 2, 14);
  ctx.fillText('爱拼豆 · 浏览器本地生成，图片未上传服务器', pad, canvas.height - pad - 6);

  return canvas;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = '';
  let yy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export async function downloadPatternPng(input: PngExportInput): Promise<void> {
  const canvas = renderPatternCanvas(input);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG 导出失败'))),
      'image/png',
    );
  });
  downloadBlob(blob, stampFilename(input.basename ?? '拼豆图纸', 'png'));
}
