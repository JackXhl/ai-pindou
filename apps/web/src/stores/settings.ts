import type { DenoiseOptions, SampleMode } from '@aipindou/core';
import {
  BEAD_UNITS,
  DEFAULT_PALETTE_ID,
  DEFAULT_UNIT_ID,
  describeSize,
  type BeadUnitId,
} from '@aipindou/registry';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { KEYS, read, write } from '../lib/storage.js';

export interface EditorPrefs {
  paletteId: string;
  unitId: BeadUnitId;
  cols: number;
  rows: number;
  simplify: number;
  sampleMode: SampleMode;
  maxColors: number;
  removeBackground: boolean;
  dither: boolean;
}

export interface CanvasViewPrefs {
  showOutline: boolean;
  majorGridEvery: number;
  mirrorPreview: boolean;
}

const CANVAS_DEFAULTS: CanvasViewPrefs = {
  showOutline: false,
  majorGridEvery: 29,
  mirrorPreview: false,
};

const DEFAULTS: EditorPrefs = {
  paletteId: DEFAULT_PALETTE_ID,
  unitId: DEFAULT_UNIT_ID,
  cols: 58,
  rows: 58,
  // 0 表示尽量保留细节，100 表示尽量简化。默认略偏简化：
  // 新手拿到一张一格一个色号的图纸会直接放弃，而细节丢一点还能接着做。
  simplify: 35,
  sampleMode: 'auto',
  maxColors: 0,
  removeBackground: false,
  dither: false,
};

export const useSettingsStore = defineStore('settings', () => {
  const saved = read<Partial<EditorPrefs>>(KEYS.editorPrefs, {});
  const prefs = ref<EditorPrefs>({ ...DEFAULTS, ...saved });
  const canvasView = ref<CanvasViewPrefs>({
    ...CANVAS_DEFAULTS,
    ...read<Partial<CanvasViewPrefs>>(KEYS.canvasView, {}),
  });

  const unit = computed(() => BEAD_UNITS[prefs.value.unitId]);

  /** 尺寸的三个口径。UI 上必须并列展示，不能只给格数。 */
  const sizeInfo = computed(() =>
    describeSize(prefs.value.cols, prefs.value.rows, unit.value),
  );

  /**
   * 把一根「简化程度」滑块展开成具体的算法参数。
   *
   * 用户不关心什么是连通域最小尺寸、什么是碎色阈值，他们只知道
   * 「这张图太碎了」或者「细节被吃掉了」。把三个互相牵制的参数收敛成
   * 一个有方向感的量，比摊开三个滑块让人反复试要好得多；
   * 需要精细控制的高级用户仍可在展开面板里单独覆盖。
   */
  const denoise = computed<DenoiseOptions>(() => {
    const s = prefs.value.simplify;
    return {
      // 0 到 3 格：简化程度越高，越激进地抹掉孤立小块
      minRegionSize: Math.round((s / 100) * 3),
      // 0 到 10 颗：全图用量低于此数的色号会被合并
      minColorCount: Math.round((s / 100) * 10),
      // 允许的替代色差随简化程度放宽，但始终有上限——
      // 再怎么简化也不该把红色并进蓝色
      maxMergeDeltaE: 6 + (s / 100) * 12,
    };
  });

  function persist() {
    write(KEYS.editorPrefs, prefs.value);
  }

  function setSize(cols: number, rows: number) {
    prefs.value.cols = Math.max(1, Math.round(cols));
    prefs.value.rows = Math.max(1, Math.round(rows));
    persist();
  }

  function setPalette(id: string) {
    prefs.value.paletteId = id;
    persist();
  }

  function setUnit(id: BeadUnitId) {
    prefs.value.unitId = id;
    persist();
  }

  function persistCanvasView() {
    write(KEYS.canvasView, canvasView.value);
  }

  function reset() {
    prefs.value = { ...DEFAULTS };
    persist();
  }

  return {
    prefs,
    canvasView,
    unit,
    sizeInfo,
    denoise,
    persist,
    persistCanvasView,
    setSize,
    setPalette,
    setUnit,
    reset,
  };
});
