import { PDFDocument } from 'pdf-lib';
import type { Bom } from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';
import { downloadBlob, stampFilename } from './download.js';
import { renderPatternCanvas, type PngMode } from './png.js';

export interface PdfExportInput {
  grid: Uint16Array;
  cols: number;
  rows: number;
  colors: PaletteColor[];
  bom: Bom;
  mode?: PngMode;
  title?: string;
  sizeLabel: string;
  paletteVersion: string;
  beadSizeLabel: string;
  /** 物理豆径 mm，用于页脚标注；1:1 需用户按「实际大小」打印 */
  beadWidthMm: number;
  mirrored?: boolean;
  basename?: string;
}

/**
 * 导出 PDF。
 *
 * 中文说明依赖系统字体，因此页面内容先画到 Canvas 再嵌入 PDF。
 * 这不是矢量路径，但可打印、可读中文，且不依赖额外字体文件。
 * 页脚明确写出：请用「实际大小 / 100%」打印，勿选适应页面。
 */
export async function downloadPatternPdf(input: PdfExportInput): Promise<void> {
  const cellPx = pickCellPx(input.cols, input.rows);
  const canvas = renderPatternCanvas({
    ...input,
    cellPx,
    title: input.title ?? '爱拼豆图纸',
  });

  // 在画布底部追加打印校准提示条
  const tipH = 48;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height + tipH;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('无法创建 PDF 画布');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = '#333333';
  ctx.font = '12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
  const physW = ((input.cols * input.beadWidthMm) / 10).toFixed(1);
  const physH = ((input.rows * input.beadWidthMm) / 10).toFixed(1);
  ctx.fillText(
    `打印：请选「实际大小 / 100%」，勿勾选适应页面。成品约 ${physW}×${physH} cm（按 ${input.beadWidthMm}mm 豆径估算）。色卡 ${input.paletteVersion}${input.mirrored ? ' · 镜像版' : ''}`,
    24,
    canvas.height + 18,
  );
  // PDF 页内再画一条与物理 1cm 接近的参考（按 72dpi：1cm≈28.35pt，此处用 canvas 像素近似）
  const cmBar = Math.round((10 / input.beadWidthMm) * cellPx);
  ctx.fillStyle = '#111';
  ctx.fillRect(24, canvas.height + 28, cmBar, 5);
  ctx.fillStyle = '#555';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('本条 ≈ 1 cm（与页眉校准条一致，请用尺子核对）', 24 + cmBar + 8, canvas.height + 33);

  const pngBytes = await canvasToPngBytes(out);
  const pdf = await PDFDocument.create();

  // A4 竖向；大图按宽度等比缩放进页边距
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 28;
  const img = await pdf.embedPng(pngBytes);
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  // 超高图纸：按纵向切片分页（重叠约 2 格高度，方便拼接）
  if (drawH <= maxH) {
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(img, {
      x: (pageW - drawW) / 2,
      y: pageH - margin - drawH,
      width: drawW,
      height: drawH,
    });
  } else {
    const overlapPx = cellPx * 2;
    const pageContentPx = Math.floor(maxH / scale);
    let y0 = 0;
    let pageIndex = 0;
    while (y0 < out.height) {
      const sliceH = Math.min(pageContentPx, out.height - y0);
      const slice = document.createElement('canvas');
      slice.width = out.width;
      slice.height = sliceH;
      const sctx = slice.getContext('2d');
      if (!sctx) throw new Error('无法切片');
      sctx.drawImage(out, 0, y0, out.width, sliceH, 0, 0, out.width, sliceH);
      // 页码条
      sctx.fillStyle = 'rgba(255,255,255,0.92)';
      sctx.fillRect(0, sliceH - 22, slice.width, 22);
      sctx.fillStyle = '#444';
      sctx.font = '11px system-ui, sans-serif';
      sctx.fillText(`第 ${pageIndex + 1} 页 · 有重叠裁切线，请对齐后拼接`, 16, sliceH - 7);

      const bytes = await canvasToPngBytes(slice);
      const embedded = await pdf.embedPng(bytes);
      const page = pdf.addPage([pageW, pageH]);
      const s = Math.min(maxW / embedded.width, maxH / embedded.height);
      const w = embedded.width * s;
      const h = embedded.height * s;
      page.drawImage(embedded, {
        x: (pageW - w) / 2,
        y: pageH - margin - h,
        width: w,
        height: h,
      });

      if (y0 + sliceH >= out.height) break;
      y0 += sliceH - overlapPx;
      pageIndex++;
    }
  }

  const bytes = await pdf.save();
  // pdf-lib 返回 Uint8Array；拷一份再交给 Blob，避免 SharedArrayBuffer 边界问题
  const copy = new Uint8Array(bytes);
  downloadBlob(
    new Blob([copy], { type: 'application/pdf' }),
    stampFilename(input.basename ?? '拼豆图纸', 'pdf'),
  );
}

function pickCellPx(cols: number, rows: number): number {
  const longest = Math.max(cols, rows);
  if (longest <= 29) return 22;
  if (longest <= 58) return 16;
  if (longest <= 87) return 12;
  return 10;
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('PNG 编码失败'));
        return;
      }
      const buf = await blob.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, 'image/png');
  });
}
