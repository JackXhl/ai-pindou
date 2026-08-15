import { computeBom } from '@aipindou/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { usePatternStore } from './pattern.js';

export type EditTool =
  | 'pan'
  | 'paint'
  | 'erase'
  | 'eyedropper'
  | 'fill'
  | 'wand';

type Patch = { index: number; from: number; to: number };

/**
 * 逐格编辑。撤销用差量 patch，避免整图入栈占内存。
 */
export const useEditStore = defineStore('edit', () => {
  const tool = ref<EditTool>('pan');
  const brushValue = ref(0);
  const undoStack = ref<Patch[][]>([]);
  const redoStack = ref<Patch[][]>([]);

  function setTool(next: EditTool) {
    tool.value = next;
  }

  function setBrushFromColorIndex(gridValue: number) {
    brushValue.value = gridValue;
  }

  function applyCell(col: number, row: number) {
    const pattern = usePatternStore();
    if (!pattern.grid || pattern.cols === 0) return;
    const index = row * pattern.cols + col;
    if (index < 0 || index >= pattern.grid.length) return;

    const from = pattern.grid[index]!;

    if (tool.value === 'wand') {
      if (from > 0) {
        // 魔棒：选中同色供批量换色；由外部设置 highlight
        brushValue.value = from;
      }
      return;
    }

    if (tool.value === 'fill') {
      if (brushValue.value <= 0) return;
      floodFill(col, row, from, brushValue.value);
      return;
    }

    let to = from;
    if (tool.value === 'erase') to = 0;
    else if (tool.value === 'paint') {
      if (brushValue.value <= 0) return;
      to = brushValue.value;
    } else if (tool.value === 'eyedropper') {
      if (from > 0) brushValue.value = from;
      tool.value = 'paint';
      return;
    } else {
      return;
    }

    if (from === to) return;

    const next = new Uint16Array(pattern.grid);
    next[index] = to;
    undoStack.value.push([{ index, from, to }]);
    redoStack.value = [];
    pattern.commitGridEdit(next, computeBom(next, pattern.colors));
  }

  /** 四连通油漆桶 */
  function floodFill(col: number, row: number, target: number, replacement: number) {
    const pattern = usePatternStore();
    if (!pattern.grid || target === replacement) return;
    const cols = pattern.cols;
    const rows = pattern.rows;
    const next = new Uint16Array(pattern.grid);
    const patches: Patch[] = [];
    const stack: number[] = [row * cols + col];
    const seen = new Uint8Array(next.length);

    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i]) continue;
      seen[i] = 1;
      if (next[i] !== target) continue;
      patches.push({ index: i, from: target, to: replacement });
      next[i] = replacement;
      const c = i % cols;
      const r = (i / cols) | 0;
      if (c > 0) stack.push(i - 1);
      if (c + 1 < cols) stack.push(i + 1);
      if (r > 0) stack.push(i - cols);
      if (r + 1 < rows) stack.push(i + cols);
    }

    if (patches.length === 0) return;
    undoStack.value.push(patches);
    redoStack.value = [];
    pattern.commitGridEdit(next, computeBom(next, pattern.colors));
  }

  function replaceColor(fromValue: number, toValue: number) {
    const pattern = usePatternStore();
    if (!pattern.grid || fromValue === toValue || toValue < 0) return;
    const next = new Uint16Array(pattern.grid);
    const patches: Patch[] = [];
    for (let i = 0; i < next.length; i++) {
      if (next[i] === fromValue) {
        patches.push({ index: i, from: fromValue, to: toValue });
        next[i] = toValue;
      }
    }
    if (patches.length === 0) return;
    undoStack.value.push(patches);
    redoStack.value = [];
    pattern.commitGridEdit(next, computeBom(next, pattern.colors));
  }

  function undo() {
    const pattern = usePatternStore();
    const patch = undoStack.value.pop();
    if (!patch || !pattern.grid) return;
    const next = new Uint16Array(pattern.grid);
    for (let i = patch.length - 1; i >= 0; i--) {
      const p = patch[i]!;
      next[p.index] = p.from;
    }
    redoStack.value.push(patch);
    pattern.commitGridEdit(next, computeBom(next, pattern.colors));
  }

  function redo() {
    const pattern = usePatternStore();
    const patch = redoStack.value.pop();
    if (!patch || !pattern.grid) return;
    const next = new Uint16Array(pattern.grid);
    for (const p of patch) next[p.index] = p.to;
    undoStack.value.push(patch);
    pattern.commitGridEdit(next, computeBom(next, pattern.colors));
  }

  function resetHistory() {
    undoStack.value = [];
    redoStack.value = [];
    brushValue.value = 0;
    tool.value = 'pan';
  }

  return {
    tool,
    brushValue,
    undoStack,
    redoStack,
    setTool,
    setBrushFromColorIndex,
    applyCell,
    floodFill,
    replaceColor,
    undo,
    redo,
    resetHistory,
  };
});
