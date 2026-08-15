<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useMyPaletteStore } from '../../stores/myPalette.js';
import { useSettingsStore } from '../../stores/settings.js';

const myPalette = useMyPaletteStore();
const settings = useSettingsStore();
const importText = ref('');
const filter = ref('');
const showPicker = ref(false);

onMounted(() => {
  void myPalette.ensurePalette(settings.prefs.paletteId);
});

watch(
  () => settings.prefs.paletteId,
  (id) => {
    if (myPalette.state.paletteId !== id) {
      myPalette.setPaletteId(id);
    } else {
      void myPalette.ensurePalette(id);
    }
  },
);

function applyImport() {
  if (!importText.value.trim()) return;
  myPalette.importCodes(importText.value);
  importText.value = '';
}

function filteredColors() {
  const colors = myPalette.paletteCache?.colors ?? [];
  const q = filter.value.trim().toUpperCase();
  if (!q) return colors;
  return colors.filter(
    (c) =>
      c.code.toUpperCase().includes(q) ||
      c.name.toUpperCase().includes(q),
  );
}

const ownedSet = () => new Set(myPalette.state.ownedCodes);
</script>

<template>
  <section class="mb-6">
    <h2 class="m-0 mb-2 text-sm font-semibold">我的色板</h2>
    <label class="mb-2 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        :checked="myPalette.state.enabled"
        @change="myPalette.setEnabled(($event.target as HTMLInputElement).checked)"
      />
      只用我有的颜色生成
    </label>
    <p class="m-0 mb-2 text-xs text-[var(--surface-text-muted)]">
      开启后，匹配只在你勾选的色号里进行，而不是生成后再替换缺色。
    </p>

    <p
      v-if="myPalette.state.enabled"
      class="tabular m-0 mb-2 text-xs text-[var(--surface-text-muted)]"
    >
      当前可用 {{ myPalette.ownedCount }} 个色号
      <button
        type="button"
        class="ml-2 underline"
        @click="showPicker = !showPicker"
      >
        {{ showPicker ? '收起' : '编辑色板' }}
      </button>
    </p>

    <div v-if="myPalette.state.enabled && showPicker" class="space-y-2">
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs"
          @click="myPalette.selectAllFromPalette()"
        >
          全选色卡
        </button>
        <button
          type="button"
          class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs"
          @click="myPalette.clearOwned()"
        >
          清空
        </button>
        <button
          type="button"
          class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs"
          @click="navigator.clipboard?.writeText(myPalette.exportCodes())"
        >
          复制色号串
        </button>
      </div>

      <textarea
        v-model="importText"
        rows="2"
        placeholder="粘贴色号串，如 A1,A2,H2 或从库存 App 导出的 CSV"
        class="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1 text-xs"
      />
      <button
        type="button"
        class="rounded bg-brand-500 px-2 py-1 text-xs text-white"
        @click="applyImport"
      >
        导入色号
      </button>

      <input
        v-model="filter"
        type="search"
        placeholder="搜索色号"
        class="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1 text-xs"
      />

      <div class="max-h-48 overflow-y-auto rounded border border-[var(--surface-border)] p-1">
        <button
          v-for="c in filteredColors()"
          :key="c.code"
          type="button"
          class="mb-0.5 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs"
          :class="
            ownedSet().has(c.code)
              ? 'bg-[var(--surface-raised)]'
              : 'opacity-60 hover:opacity-100'
          "
          :title="c.unidentified ? '色号待确认' : c.name"
          @click="myPalette.toggleOwned(c.code)"
        >
          <span
            class="h-3 w-3 shrink-0 rounded-sm border border-black/20"
            :style="{ background: c.hex }"
          />
          <span class="tabular">{{ c.code }}</span>
          <span
            v-if="c.confidence === 'low'"
            class="ml-auto text-[var(--color-warning)]"
          >低可信</span>
        </button>
      </div>
      <p class="m-0 text-[10px] text-[var(--surface-text-muted)]">
        套装档位的具体色号因商家而异，无公开可靠数据，请按你实际拥有的豆子勾选或导入。
      </p>
    </div>
  </section>
</template>
