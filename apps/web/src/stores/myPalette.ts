import { DEFAULT_PALETTE_ID, loadPalette, type Palette } from '@aipindou/registry';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { KEYS, read, write } from '../lib/storage.js';

/**
 * 我的色板：三段式库存。
 *
 * 套装档位 + 追加散色 + 排除色。只做选套装会漏掉补过散色的老玩家；
 * 只做 221 个复选框又没人愿填。codesKnown 为 false 时套装只表示「色数档位」，
 * 需要用户自行勾选/导入具体色号——我们不假装知道义乌①号盘装了哪些色。
 */
export interface MyPaletteState {
  paletteId: string;
  /** 选中的套装档位色数；null 表示用全色卡 */
  setCount: number | null;
  /** 额外拥有的散色色号 */
  extraCodes: string[];
  /** 明确排除 / 已用尽的色号 */
  excludedCodes: string[];
  /** 是否启用「只用我有的颜色」约束配色 */
  enabled: boolean;
  /**
   * 当套装具体色号未知时，用户手动勾选的「我有的色号」。
   * 与 setCount 配合：先选档位作提示，真正生效的是这个集合 + extra - excluded。
   */
  ownedCodes: string[];
}

const DEFAULT_STATE: MyPaletteState = {
  paletteId: DEFAULT_PALETTE_ID,
  setCount: null,
  extraCodes: [],
  excludedCodes: [],
  enabled: false,
  ownedCodes: [],
};

export const useMyPaletteStore = defineStore('my-palette', () => {
  const state = ref<MyPaletteState>({
    ...DEFAULT_STATE,
    ...read<Partial<MyPaletteState>>(KEYS.myPalette, {}),
  });

  const paletteCache = ref<Palette | null>(null);
  const loading = ref(false);

  async function ensurePalette(id = state.value.paletteId) {
    if (paletteCache.value?.id === id) return paletteCache.value;
    loading.value = true;
    try {
      paletteCache.value = await loadPalette(id);
      return paletteCache.value;
    } finally {
      loading.value = false;
    }
  }

  function persist() {
    write(KEYS.myPalette, state.value);
  }

  watch(
    state,
    () => {
      persist();
    },
    { deep: true },
  );

  /**
   * 最终可用色号列表。
   * enabled=false 时返回 null，表示不限制（调用方用全色卡）。
   */
  const availableCodes = computed<string[] | null>(() => {
    if (!state.value.enabled) return null;
    const owned = new Set(state.value.ownedCodes);
    for (const code of state.value.extraCodes) owned.add(code);
    for (const code of state.value.excludedCodes) owned.delete(code);
    return [...owned];
  });

  const ownedCount = computed(() => availableCodes.value?.length ?? 0);

  function setEnabled(on: boolean) {
    state.value.enabled = on;
  }

  function setPaletteId(id: string) {
    state.value.paletteId = id;
    state.value.ownedCodes = [];
    state.value.extraCodes = [];
    state.value.excludedCodes = [];
    state.value.setCount = null;
    void ensurePalette(id);
  }

  function setSetCount(count: number | null) {
    state.value.setCount = count;
  }

  function toggleOwned(code: string) {
    const list = state.value.ownedCodes;
    const i = list.indexOf(code);
    if (i >= 0) list.splice(i, 1);
    else list.push(code);
  }

  function selectAllFromPalette() {
    const p = paletteCache.value;
    if (!p) return;
    state.value.ownedCodes = p.colors
      .filter((c) => !c.unidentified)
      .map((c) => c.code);
  }

  function clearOwned() {
    state.value.ownedCodes = [];
  }

  /** 从逗号/空白/换行分隔的色号串导入 */
  function importCodes(raw: string) {
    const codes = raw
      .split(/[\s,，;；、]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const set = new Set(state.value.ownedCodes.map((c) => c.toUpperCase()));
    for (const c of codes) set.add(c);
    state.value.ownedCodes = [...set];
    state.value.enabled = true;
  }

  function exportCodes(): string {
    return (availableCodes.value ?? []).join(',');
  }

  function exclude(code: string) {
    if (!state.value.excludedCodes.includes(code)) {
      state.value.excludedCodes.push(code);
    }
  }

  function unexclude(code: string) {
    state.value.excludedCodes = state.value.excludedCodes.filter((c) => c !== code);
  }

  return {
    state,
    paletteCache,
    loading,
    availableCodes,
    ownedCount,
    ensurePalette,
    setEnabled,
    setPaletteId,
    setSetCount,
    toggleOwned,
    selectAllFromPalette,
    clearOwned,
    importCodes,
    exportCodes,
    exclude,
    unexclude,
  };
});
