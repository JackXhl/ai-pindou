import type { Bom } from '@aipindou/core';
import type { PaletteColor } from '@aipindou/registry';
import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef } from 'vue';
import type {
  GenerateRequest,
  GenerateSuccess,
  WorkerResponse,
} from '../workers/generate.worker.js';

export interface PatternReport {
  averageDeltaE: number;
  maxDeltaE: number;
  denoisedCells: number;
  mergedRareColors: number;
  keptRareColors: string[];
  limitRemoved: string[];
  backgroundCleared: number;
}

export type GenerateStatus = 'idle' | 'generating' | 'ready' | 'error';

/**
 * 图纸数据。
 *
 * **grid 与 colors 一律用 shallowRef + markRaw。**
 * Vue 的深度响应式会给 Uint16Array 套 Proxy，此后每一次 grid[i] 都要过一遍
 * trap；渲染一张 116×116 的图纸要读一万三千次，再叠加重绘频率，
 * 帧率会直接塌掉。这里的数据是整块替换的，不需要元素级响应式。
 */
export const usePatternStore = defineStore('pattern', () => {
  const grid = shallowRef<Uint16Array | null>(null);
  const colors = shallowRef<PaletteColor[]>([]);
  const bom = shallowRef<Bom | null>(null);
  const report = shallowRef<PatternReport | null>(null);

  const cols = ref(0);
  const rows = ref(0);
  const status = ref<GenerateStatus>('idle');
  const errorMessage = ref('');
  const durationMs = ref(0);

  const hasPattern = computed(() => grid.value !== null && cols.value > 0);
  const totalCells = computed(() => cols.value * rows.value);

  let worker: Worker | null = null;
  let nextRequestId = 1;
  // 用户拖动参数时会连发请求，只认最后一个，避免旧结果覆盖新结果
  let latestRequestId = 0;

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(
      new URL('../workers/generate.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.requestId !== latestRequestId) return;

      if (data.type === 'error') {
        status.value = 'error';
        errorMessage.value = data.message;
        return;
      }
      applyResult(data);
    };
    worker.onerror = (event) => {
      status.value = 'error';
      errorMessage.value = `生成失败：${event.message || '未知错误'}`;
    };
    return worker;
  }

  function applyResult(data: GenerateSuccess) {
    // markRaw 是第二道保险：即便这些值被塞进 reactive 容器也不会被代理
    grid.value = markRaw(new Uint16Array(data.grid));
    colors.value = markRaw(data.colors);
    bom.value = markRaw(data.bom as Bom);
    report.value = markRaw(data.report as PatternReport);
    cols.value = data.cols;
    rows.value = data.rows;
    durationMs.value = data.durationMs;
    status.value = 'ready';
    errorMessage.value = '';
  }

  /** 逐格编辑后写回：替换 grid 引用以触发 shallowRef，并重算 BOM */
  function commitGridEdit(next: Uint16Array, nextBom: Bom) {
    grid.value = markRaw(next);
    bom.value = markRaw(nextBom);
  }

  function setError(message: string) {
    status.value = 'error';
    errorMessage.value = message;
  }

  function loadFromDraft(input: {
    cols: number;
    rows: number;
    grid: Uint16Array;
    colors: PaletteColor[];
    bom: Bom;
  }) {
    cols.value = input.cols;
    rows.value = input.rows;
    grid.value = markRaw(input.grid);
    colors.value = markRaw(input.colors);
    bom.value = markRaw(input.bom);
    report.value = null;
    status.value = 'ready';
    errorMessage.value = '';
  }

  interface GenerateInput {
    image: ImageData;
    paletteId: string;
    availableCodes?: string[];
    options: GenerateRequest['options'];
  }

  function requestGenerate(input: GenerateInput) {
    const w = ensureWorker();
    const requestId = nextRequestId++;
    latestRequestId = requestId;
    status.value = 'generating';
    errorMessage.value = '';

    // 复制一份像素数据再转移所有权：原 ImageData 可能还要用于重新生成，
    // 直接转移会让调用方手上的缓冲变成长度 0 的空壳。
    const pixels = input.image.data.slice().buffer;

    const message: GenerateRequest = {
      type: 'generate',
      requestId,
      width: input.image.width,
      height: input.image.height,
      pixels,
      paletteId: input.paletteId,
      ...(input.availableCodes ? { availableCodes: input.availableCodes } : {}),
      options: input.options,
    };
    w.postMessage(message, [pixels]);
  }

  function reset() {
    grid.value = null;
    colors.value = [];
    bom.value = null;
    report.value = null;
    cols.value = 0;
    rows.value = 0;
    status.value = 'idle';
    errorMessage.value = '';
  }

  function dispose() {
    worker?.terminate();
    worker = null;
  }

  return {
    grid,
    colors,
    bom,
    report,
    cols,
    rows,
    status,
    errorMessage,
    durationMs,
    hasPattern,
    totalCells,
    requestGenerate,
    commitGridEdit,
    loadFromDraft,
    setError,
    reset,
    dispose,
  };
});
