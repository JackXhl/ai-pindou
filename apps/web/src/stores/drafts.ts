import type { PaletteColor } from '@aipindou/registry';
import { computeBom } from '@aipindou/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  deleteDraft,
  getDraft,
  listDrafts,
  newDraftId,
  putDraft,
  type DraftRecord,
} from '../lib/idb.js';
import { usePatternStore } from './pattern.js';
import { useSettingsStore } from './settings.js';

const AUTOSAVE_KEY = 'autosave';

export const useDraftStore = defineStore('drafts', () => {
  const items = ref<DraftRecord[]>([]);
  const currentId = ref<string | null>(null);
  const status = ref('');

  async function refresh() {
    try {
      items.value = (await listDrafts()).filter((d) => d.id !== AUTOSAVE_KEY);
    } catch {
      items.value = [];
    }
  }

  async function saveNamed(title?: string): Promise<boolean> {
    const pattern = usePatternStore();
    const settings = useSettingsStore();
    if (!pattern.grid || !pattern.hasPattern) {
      status.value = '没有可保存的图纸';
      return false;
    }
    const id = currentId.value && currentId.value !== AUTOSAVE_KEY
      ? currentId.value
      : newDraftId();
    const draft: DraftRecord = {
      id,
      title: title?.trim() || `草稿 ${new Date().toLocaleString('zh-CN')}`,
      updatedAt: Date.now(),
      paletteId: settings.prefs.paletteId,
      cols: pattern.cols,
      rows: pattern.rows,
      colors: pattern.colors.map((c) => ({
        code: c.code,
        name: c.name,
        hex: c.hex,
        lab: [...c.lab] as [number, number, number],
      })),
      grid: Array.from(pattern.grid),
      prefs: { ...settings.prefs },
    };
    try {
      await putDraft(draft);
      currentId.value = id;
      status.value = '已保存';
      await refresh();
      return true;
    } catch {
      status.value = '保存失败（可能是隐私模式或存储已满）';
      return false;
    }
  }

  /** 刷新前自动存一份，打开编辑器时恢复 */
  async function autosave(): Promise<void> {
    const pattern = usePatternStore();
    const settings = useSettingsStore();
    if (!pattern.grid || !pattern.hasPattern) return;
    const draft: DraftRecord = {
      id: AUTOSAVE_KEY,
      title: '自动保存',
      updatedAt: Date.now(),
      paletteId: settings.prefs.paletteId,
      cols: pattern.cols,
      rows: pattern.rows,
      colors: pattern.colors.map((c) => ({
        code: c.code,
        name: c.name,
        hex: c.hex,
        lab: [...c.lab] as [number, number, number],
      })),
      grid: Array.from(pattern.grid),
      prefs: { ...settings.prefs },
    };
    try {
      await putDraft(draft);
    } catch {
      /* 忽略 */
    }
  }

  async function load(id: string): Promise<boolean> {
    try {
      const draft = await getDraft(id);
      if (!draft) {
        status.value = '草稿不存在';
        return false;
      }
      applyDraft(draft);
      if (id !== AUTOSAVE_KEY) currentId.value = id;
      status.value = '已打开草稿';
      return true;
    } catch {
      status.value = '打开失败';
      return false;
    }
  }

  async function restoreAutosave(): Promise<boolean> {
    return load(AUTOSAVE_KEY);
  }

  async function hasAutosave(): Promise<boolean> {
    try {
      return (await getDraft(AUTOSAVE_KEY)) != null;
    } catch {
      return false;
    }
  }

  async function discardAutosave(): Promise<void> {
    try {
      await deleteDraft(AUTOSAVE_KEY);
    } catch {
      /* 忽略 */
    }
  }

  function applyDraft(draft: DraftRecord) {
    const pattern = usePatternStore();
    const settings = useSettingsStore();
    const grid = new Uint16Array(draft.grid);
    const colors = draft.colors as PaletteColor[];
    const bom = computeBom(grid, colors);
    pattern.loadFromDraft({
      cols: draft.cols,
      rows: draft.rows,
      grid,
      colors,
      bom,
    });
    if (draft.prefs) {
      Object.assign(settings.prefs, draft.prefs);
      settings.persist();
    }
    if (draft.paletteId) settings.setPalette(draft.paletteId);
  }

  async function remove(id: string) {
    await deleteDraft(id);
    if (currentId.value === id) currentId.value = null;
    await refresh();
  }

  return {
    items,
    currentId,
    status,
    refresh,
    saveNamed,
    autosave,
    load,
    restoreAutosave,
    hasAutosave,
    discardAutosave,
    remove,
  };
});
