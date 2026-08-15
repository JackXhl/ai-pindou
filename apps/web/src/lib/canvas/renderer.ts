import { contrastTextColor, hexToRgb } from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';

/**
 * 图纸渲染器。
 *
 * 核心思路：**色块层按「一格一像素」渲染到离屏画布，再整体缩放贴到屏幕上。**
 *
 * 直觉做法是每格调用一次 fillRect，116×116 就是 13456 次调用，每帧重绘
 * 都要重来一遍，拖动时必然掉帧。改成先把整张图纸写进一块 cols×rows 的
 * ImageData（纯内存写入，约 0.1ms），再用 drawImage 一次性缩放，
 * 开销与图纸大小几乎无关。关闭图像平滑后放大出来就是锐利的方格，
 * 正是拼豆需要的效果。
 *
 * 网格线与色号文字则相反：它们的绘制量取决于**可见格数**而非图纸总格数，
 * 所以直接画在主画布上，并按缩放级别决定画不画。
 */

export interface Viewport {
  /** 每格占多少 CSS 像素 */
  scale: number;
  /** 画布左上角对应的图纸坐标偏移（CSS 像素） */
  offsetX: number;
  offsetY: number;
}

export interface RenderOptions {
  /** 高亮的 grid 取值。点击图例时用来定位同色格子。 */
  highlightValue?: number;
  /** 是否显示色号文字 */
  showCodes?: boolean;
  /** 每隔多少格画一条粗分隔线。对应底板尺寸，默认 29。 */
  majorGridEvery?: number;
  /** 水平镜像预览（胶带法对照） */
  mirrored?: boolean;
  /** 每格描边，打印对照更清晰 */
  showOutline?: boolean;
  /** 摆豆模式：未完成灰白、已完成真彩；可压暗非焦点色 */
  craft?: {
    cells: Uint8Array;
    focusColor: number;
  };
}

/**
 * 细节层级。
 *
 * 缩得很小的时候画网格线只会糊成一片灰，既没用又拖慢渲染；
 * 放得很大时不画色号又没法照着摆。四档的分界点按「一格在屏幕上有多大」定，
 * 而不是按缩放倍数——后者在不同 DPR 的设备上表现不一致。
 */
export type DetailLevel = 'blocks' | 'grid' | 'major' | 'codes';

export function detailLevelFor(scale: number): DetailLevel {
  if (scale < 3) return 'blocks';
  if (scale < 8) return 'grid';
  if (scale < 16) return 'major';
  return 'codes';
}

const EMPTY = 0;

export class PatternRenderer {
  private ctx: CanvasRenderingContext2D;
  private blockLayer: HTMLCanvasElement | null = null;
  private cols = 0;
  private rows = 0;
  private grid: Uint16Array | null = null;
  private colors: PaletteColor[] = [];
  /** 每个色号预先算好的文字颜色，避免逐格重复计算亮度 */
  private textColors: string[] = [];
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('无法获取 2D 绘图上下文');
    this.ctx = ctx;
  }

  /** 更新图纸数据并重建色块层 */
  setPattern(grid: Uint16Array, cols: number, rows: number, colors: PaletteColor[]) {
    this.grid = grid;
    this.cols = cols;
    this.rows = rows;
    this.colors = colors;
    this.textColors = colors.map((c) => contrastTextColor(hexToRgb(c.hex)));
    this.buildBlockLayer();
  }

  /**
   * 把整张图纸写成一块 cols×rows 的位图。
   * 直接操作 Uint32Array 比逐通道写 Uint8 快得多。
   */
  private buildBlockLayer() {
    if (!this.grid) return;
    const { cols, rows, grid } = this;

    const layer = document.createElement('canvas');
    layer.width = cols;
    layer.height = rows;
    const lctx = layer.getContext('2d');
    if (!lctx) throw new Error('无法创建离屏画布');

    const image = lctx.createImageData(cols, rows);
    const buf = new Uint32Array(image.data.buffer);

    // 预先把色板转成 0xAABBGGRR（小端序下 Uint32 的通道顺序）
    const packed = new Uint32Array(this.colors.length + 1);
    for (let i = 0; i < this.colors.length; i++) {
      const [r, g, b] = hexToRgb(this.colors[i]!.hex);
      packed[i + 1] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    packed[EMPTY] = 0; // 空格全透明

    for (let i = 0; i < grid.length; i++) {
      buf[i] = packed[grid[i]!] ?? 0;
    }

    lctx.putImageData(image, 0, 0);
    this.blockLayer = layer;
  }

  /** 适配设备像素比。不做这一步，高分屏上网格线与文字都是糊的。 */
  resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1) {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  get cssWidth(): number {
    return this.canvas.width / this.dpr;
  }

  get cssHeight(): number {
    return this.canvas.height / this.dpr;
  }

  render(viewport: Viewport, options: RenderOptions = {}) {
    const { ctx, dpr } = this;
    const w = this.cssWidth;
    const h = this.cssHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!this.blockLayer || !this.grid) return;

    const { scale, offsetX, offsetY } = viewport;
    const level = detailLevelFor(scale);
    const mirrored = options.mirrored ?? false;

    // 1. 色块层：一次 drawImage 搞定整张图
    ctx.imageSmoothingEnabled = false;
    if (mirrored) {
      ctx.save();
      ctx.translate(offsetX + this.cols * scale, offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.blockLayer,
        0,
        0,
        this.cols,
        this.rows,
        0,
        0,
        this.cols * scale,
        this.rows * scale,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        this.blockLayer,
        offsetX,
        offsetY,
        this.cols * scale,
        this.rows * scale,
      );
    }

    // 只处理可见区域，避免在缩放很大时遍历全图
    const startCol = Math.max(0, Math.floor(-offsetX / scale));
    const endCol = Math.min(this.cols, Math.ceil((w - offsetX) / scale));
    const startRow = Math.max(0, Math.floor(-offsetY / scale));
    const endRow = Math.min(this.rows, Math.ceil((h - offsetY) / scale));

    if (options.craft) {
      this.drawCraftOverlay(
        viewport,
        options.craft,
        startCol,
        endCol,
        startRow,
        endRow,
        mirrored,
      );
    }

    if (options.highlightValue !== undefined && options.highlightValue > 0) {
      this.drawHighlight(
        viewport,
        options.highlightValue,
        startCol,
        endCol,
        startRow,
        endRow,
        mirrored,
      );
    }

    if (options.showOutline) {
      this.drawOutline(viewport, startCol, endCol, startRow, endRow, mirrored);
    }

    if (level !== 'blocks') {
      this.drawGrid(viewport, level, startCol, endCol, startRow, endRow, options, mirrored);
    }

    if (level === 'codes' && options.showCodes !== false) {
      this.drawCodes(viewport, startCol, endCol, startRow, endRow, mirrored);
    }
  }

  /** 逻辑列 → 屏幕 X（支持镜像） */
  private cellX(col: number, scale: number, offsetX: number, mirrored: boolean): number {
    const c = mirrored ? this.cols - 1 - col : col;
    return offsetX + c * scale;
  }

  private drawGrid(
    viewport: Viewport,
    level: DetailLevel,
    startCol: number,
    endCol: number,
    startRow: number,
    endRow: number,
    options: RenderOptions,
    mirrored: boolean,
  ) {
    const { ctx } = this;
    const { scale, offsetX, offsetY } = viewport;
    const major = options.majorGridEvery ?? 29;

    // 细网格
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1 / this.dpr;
    ctx.beginPath();
    for (let c = startCol; c <= endCol; c++) {
      const x = Math.round(this.cellX(c, scale, offsetX, mirrored)) + 0.5 / this.dpr;
      ctx.moveTo(x, offsetY + startRow * scale);
      ctx.lineTo(x, offsetY + endRow * scale);
    }
    for (let r = startRow; r <= endRow; r++) {
      const y = Math.round(offsetY + r * scale) + 0.5 / this.dpr;
      ctx.moveTo(offsetX + startCol * scale, y);
      ctx.lineTo(offsetX + endCol * scale, y);
    }
    ctx.stroke();

    if (level === 'grid') return;

    // 粗分隔线：对应底板边界，是用户分板拼接时的关键参照
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 2 / this.dpr;
    ctx.beginPath();
    for (let c = startCol; c <= endCol; c++) {
      if (c % major !== 0) continue;
      const x = Math.round(this.cellX(c, scale, offsetX, mirrored)) + 0.5 / this.dpr;
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + this.rows * scale);
    }
    for (let r = startRow; r <= endRow; r++) {
      if (r % major !== 0) continue;
      const y = Math.round(offsetY + r * scale) + 0.5 / this.dpr;
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + this.cols * scale, y);
    }
    ctx.stroke();
  }

  private drawCodes(
    viewport: Viewport,
    startCol: number,
    endCol: number,
    startRow: number,
    endRow: number,
    mirrored: boolean,
  ) {
    const { ctx, grid, cols } = this;
    if (!grid) return;
    const { scale, offsetX, offsetY } = viewport;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(7, Math.floor(scale * 0.42))}px ui-monospace, monospace`;

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const value = grid[r * cols + c]!;
        if (value === EMPTY) continue;
        ctx.fillStyle = this.textColors[value - 1] ?? '#000000';
        ctx.fillText(
          this.colors[value - 1]!.code,
          this.cellX(c, scale, offsetX, mirrored) + scale / 2,
          offsetY + (r + 0.5) * scale,
        );
      }
    }
  }

  /** 每格描边，对照摆豆时边界更清晰 */
  private drawOutline(
    viewport: Viewport,
    startCol: number,
    endCol: number,
    startRow: number,
    endRow: number,
    mirrored: boolean,
  ) {
    const { ctx, grid, cols } = this;
    if (!grid) return;
    const { scale, offsetX, offsetY } = viewport;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(0.5, scale * 0.06);
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        if (grid[r * cols + c] === EMPTY) continue;
        const x = this.cellX(c, scale, offsetX, mirrored);
        const y = offsetY + r * scale;
        ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, scale - ctx.lineWidth, scale - ctx.lineWidth);
      }
    }
  }

  /** 高亮某个色号的全部格子，用于图例联动 */
  private drawHighlight(
    viewport: Viewport,
    value: number,
    startCol: number,
    endCol: number,
    startRow: number,
    endRow: number,
    mirrored: boolean,
  ) {
    const { ctx, grid, cols } = this;
    if (!grid) return;
    const { scale, offsetX, offsetY } = viewport;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const v = grid[r * cols + c]!;
        if (v === value || v === EMPTY) continue;
        ctx.fillRect(
          this.cellX(c, scale, offsetX, mirrored),
          offsetY + r * scale,
          scale,
          scale,
        );
      }
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, scale * 0.08);
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        if (grid[r * cols + c] !== value) continue;
        const x = this.cellX(c, scale, offsetX, mirrored);
        const y = offsetY + r * scale;
        ctx.strokeRect(x, y, scale, scale);
      }
    }
    ctx.restore();
  }

  /**
   * 摆豆覆盖层：未完成盖灰白符号，已完成保留真彩；
   * 单色作业时非焦点色再压暗一层。
   */
  private drawCraftOverlay(
    viewport: Viewport,
    craft: { cells: Uint8Array; focusColor: number },
    startCol: number,
    endCol: number,
    startRow: number,
    endRow: number,
    mirrored: boolean,
  ) {
    const { ctx, grid, cols } = this;
    if (!grid) return;
    const { scale, offsetX, offsetY } = viewport;
    const { cells, focusColor } = craft;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(8, Math.floor(scale * 0.45))}px ui-monospace, monospace`;

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const i = r * cols + c;
        const v = grid[i]!;
        if (v === EMPTY) continue;
        const x = this.cellX(c, scale, offsetX, mirrored);
        const y = offsetY + r * scale;
        const done = cells[i] === 1;

        if (!done) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#d8d8d8' : '#cfcfcf';
          ctx.fillRect(x, y, scale, scale);
          if (scale >= 10) {
            ctx.fillStyle = '#666666';
            ctx.fillText('·', x + scale / 2, y + scale / 2);
          }
        }

        if (focusColor > 0 && v !== focusColor) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(x, y, scale, scale);
        }
      }
    }
    ctx.restore();
  }

  /** 屏幕坐标转格子坐标，越界返回 null */
  hitTest(viewport: Viewport, cssX: number, cssY: number, mirrored = false): { col: number; row: number } | null {
    let col = Math.floor((cssX - viewport.offsetX) / viewport.scale);
    const row = Math.floor((cssY - viewport.offsetY) / viewport.scale);
    if (mirrored) col = this.cols - 1 - col;
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  /** 计算让整张图纸恰好铺满容器的视口参数 */
  fitViewport(padding = 24): Viewport {
    const w = this.cssWidth - padding * 2;
    const h = this.cssHeight - padding * 2;
    if (this.cols === 0 || this.rows === 0) {
      return { scale: 1, offsetX: 0, offsetY: 0 };
    }
    const scale = Math.max(0.5, Math.min(w / this.cols, h / this.rows));
    return {
      scale,
      offsetX: (this.cssWidth - this.cols * scale) / 2,
      offsetY: (this.cssHeight - this.rows * scale) / 2,
    };
  }
}
