import { CELL_STATE } from '@aipindou/registry';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { KEYS, read, write } from '../lib/storage.js';

/**
 * 摆豆进度。与图纸分离存储。
 * Wake Lock / 找漏 / 按行推进仍属后续迭代。
 */
export const useCraftStore = defineStore('craft', () => {
  const active = ref(false);
  const focusColor = ref(0);
  const cells = shallowRef<Uint8Array | null>(null);
  const patternKey = ref('');
  const totalCells = ref(0);

  const doneCount = computed(() => {
    if (!cells.value) return 0;
    let n = 0;
    for (let i = 0; i < cells.value.length; i++) {
      if (cells.value[i] === CELL_STATE.DONE) n++;
    }
    return n;
  });

  const progressRatio = computed(() => {
    if (totalCells.value <= 0) return 0;
    return doneCount.value / totalCells.value;
  });

  /** 当前焦点色还需摆多少（无焦点则返回全图剩余） */
  function remainingFor(
    grid: Uint16Array | null,
    colorValue = focusColor.value,
  ): number {
    if (!grid || !cells.value) return 0;
    let n = 0;
    for (let i = 0; i < grid.length; i++) {
      if (cells.value[i] === CELL_STATE.DONE) continue;
      if (grid[i] === 0) continue;
      if (colorValue > 0 && grid[i] !== colorValue) continue;
      n++;
    }
    return n;
  }

  const summary = computed(() => {
    if (!active.value || !cells.value) return '';
    const pct = Math.round(progressRatio.value * 100);
    return `已完成 ${doneCount.value}/${totalCells.value}（${pct}%）`;
  });

  function persist() {
    if (!cells.value) return;
    write(KEYS.craftProgress, {
      key: patternKey.value,
      data: Array.from(cells.value),
    });
  }

  function start(key: string, length: number) {
    patternKey.value = key;
    totalCells.value = length;
    const progress = read<{ key: string; data: number[] } | null>(
      KEYS.craftProgress,
      null,
    );
    if (progress && progress.key === key && progress.data.length === length) {
      cells.value = new Uint8Array(progress.data);
    } else {
      cells.value = new Uint8Array(length);
    }
    active.value = true;
  }

  function stop() {
    active.value = false;
    focusColor.value = 0;
  }

  function toggleCell(index: number) {
    if (!cells.value) return;
    const next = new Uint8Array(cells.value);
    next[index] =
      next[index] === CELL_STATE.DONE ? CELL_STATE.TODO : CELL_STATE.DONE;
    cells.value = next;
    persist();
  }

  function markDone(index: number) {
    if (!cells.value || index < 0 || index >= cells.value.length) return;
    if (cells.value[index] === CELL_STATE.DONE) return;
    const next = new Uint8Array(cells.value);
    next[index] = CELL_STATE.DONE;
    cells.value = next;
    persist();
  }

  function setFocusColor(value: number) {
    focusColor.value = focusColor.value === value ? 0 : value;
  }

  return {
    active,
    focusColor,
    cells,
    doneCount,
    progressRatio,
    summary,
    totalCells,
    remainingFor,
    start,
    stop,
    toggleCell,
    markDone,
    setFocusColor,
  };
});
