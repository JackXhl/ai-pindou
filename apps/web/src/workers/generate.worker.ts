/**
 * 生成管线 Worker。
 *
 * 生成一张 116×116 的图纸要做上万次 CIEDE2000 运算，跑在主线程上会让页面
 * 卡死数秒——移动端更久。放进 Worker 后主线程始终可响应，用户能在生成过程中
 * 继续调参数或取消。
 *
 * 传输一律用 Transferable：ImageData 的像素缓冲和结果的 grid 都是
 * TypedArray，转移所有权是零拷贝，而结构化克隆一张 4000×3000 的图要复制 48MB。
 */

/// <reference lib="webworker" />

import { generate, type GenerateOptions } from '@aipindou/core';
import type { Palette, PaletteColor } from '@aipindou/registry';

// 默认的 lib.dom 会把 self 推断成 Window，导致 postMessage 的
// Transferable 重载对不上。Worker 文件必须显式声明自己的全局作用域类型。
declare const self: DedicatedWorkerGlobalScope;

/** 色卡加载器。与 registry 的 loaders 保持一致，Vite 会各自代码分割。 */
const paletteLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  'mard-221': () => import('@aipindou/registry/data/mard-221.json'),
  'mard-291': () => import('@aipindou/registry/data/mard-291.json'),
  'coco-291': () => import('@aipindou/registry/data/coco-291.json'),
  'artkal-c197': () => import('@aipindou/registry/data/artkal-c197.json'),
  'artkal-m221': () => import('@aipindou/registry/data/artkal-m221.json'),
  perler: () => import('@aipindou/registry/data/perler.json'),
  hama: () => import('@aipindou/registry/data/hama.json'),
  'manman-278': () => import('@aipindou/registry/data/manman-278.json'),
  'panpan-289': () => import('@aipindou/registry/data/panpan-289.json'),
  'mixiaowo-290': () => import('@aipindou/registry/data/mixiaowo-290.json'),
};

const cache = new Map<string, Palette>();

async function getPalette(id: string): Promise<Palette> {
  const cached = cache.get(id);
  if (cached) return cached;
  const loader = paletteLoaders[id];
  if (!loader) throw new Error(`未知色卡：${id}`);
  const mod = await loader();
  const palette = mod.default as Palette;
  cache.set(id, palette);
  return palette;
}

export interface GenerateRequest {
  type: 'generate';
  /** 请求序号。用户快速拖动参数时会连发多个请求，用它丢弃过期结果。 */
  requestId: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  paletteId: string;
  /** 可用色号。为空表示使用整个色板。 */
  availableCodes?: string[];
  options: Omit<GenerateOptions, 'availableColors'>;
}

export interface GenerateSuccess {
  type: 'success';
  requestId: number;
  cols: number;
  rows: number;
  grid: ArrayBuffer;
  colors: PaletteColor[];
  bom: unknown;
  report: unknown;
  durationMs: number;
}

export interface GenerateFailure {
  type: 'error';
  requestId: number;
  message: string;
}

export type WorkerResponse = GenerateSuccess | GenerateFailure;

self.onmessage = async (event: MessageEvent<GenerateRequest>) => {
  const req = event.data;
  if (req.type !== 'generate') return;

  const started = performance.now();
  try {
    const palette = await getPalette(req.paletteId);

    // 可用色作为匹配阶段的输入域。这里按色号筛出子集后传给 generate，
    // 而不是生成完再过滤——后者会让色块碎裂、图纸结构反复重排。
    let availableColors: PaletteColor[] | undefined;
    if (req.availableCodes && req.availableCodes.length > 0) {
      const wanted = new Set(req.availableCodes);
      availableColors = palette.colors.filter((c) => wanted.has(c.code));
      if (availableColors.length === 0) {
        throw new Error('所选色号在当前色卡中都不存在，请检查「我的色板」设置。');
      }
    }

    const result = generate(
      {
        width: req.width,
        height: req.height,
        data: new Uint8ClampedArray(req.pixels),
      },
      palette,
      availableColors
        ? { ...req.options, availableColors }
        : req.options,
    );

    const response: GenerateSuccess = {
      type: 'success',
      requestId: req.requestId,
      cols: result.pattern.size.cols,
      rows: result.pattern.size.rows,
      grid: result.pattern.grid.buffer as ArrayBuffer,
      colors: result.pattern.palette,
      bom: result.bom,
      report: result.report,
      durationMs: Math.round(performance.now() - started),
    };

    // 转移 grid 的所有权，避免复制
    self.postMessage(response, [response.grid]);
  } catch (error) {
    const response: GenerateFailure = {
      type: 'error',
      requestId: req.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
