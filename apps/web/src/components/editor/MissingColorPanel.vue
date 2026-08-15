<script setup lang="ts">
import { computed } from 'vue';
import {
  ROLE_LABEL,
  analyzeMissingColors,
  type MissingColorAdvice,
} from '../../lib/missingColors.js';
import { useEditStore } from '../../stores/edit.js';
import { useMyPaletteStore } from '../../stores/myPalette.js';
import { usePatternStore } from '../../stores/pattern.js';

const emit = defineEmits<{
  rerun: [];
  highlight: [value: number];
}>();

const pattern = usePatternStore();
const myPalette = useMyPaletteStore();
const edit = useEditStore();

const advice = computed(() => {
  if (!pattern.bom || myPalette.ownedCount === 0) return [] as MissingColorAdvice[];
  const codes = myPalette.availableCodes ?? myPalette.state.ownedCodes;
  if (!codes.length) return [];
  const ownedSet = new Set(codes);
  const ownedColors = (myPalette.paletteCache?.colors ?? []).filter((c) =>
    ownedSet.has(c.code),
  );
  return analyzeMissingColors(pattern.bom, codes, ownedColors);
});

function applySubstitute(item: MissingColorAdvice, toCode: string) {
  const target = pattern.colors.findIndex((c) => c.code === toCode);
  if (target < 0) return;
  edit.replaceColor(item.gridValue, target + 1);
}

function excludeAndRerun(item: MissingColorAdvice) {
  if (myPalette.ownedCount === 0) {
    myPalette.selectAllFromPalette();
  }
  myPalette.exclude(item.missing.code);
  myPalette.setEnabled(true);
  emit('rerun');
}
</script>

<template>
  <section v-if="advice.length" class="mb-6">
    <h2 class="m-0 mb-1 text-sm font-semibold">缺色决策</h2>
    <p class="m-0 mb-3 text-xs text-[var(--surface-text-muted)]">
      对照「我的色板」：图纸用到了你未勾选的色号。可替代、补货，或排除后重跑。
    </p>

    <ul class="m-0 list-none space-y-3 p-0">
      <li
        v-for="item in advice"
        :key="item.missing.code"
        class="rounded-[var(--radius-control)] border border-[var(--surface-border)] p-2"
      >
        <button
          type="button"
          class="mb-2 flex w-full items-center gap-2 text-left text-sm"
          @click="emit('highlight', item.gridValue)"
        >
          <span
            class="h-4 w-4 shrink-0 rounded-sm border border-black/20"
            :style="{ background: item.missing.hex }"
          />
          <span class="tabular font-medium">{{ item.missing.code }}</span>
          <span class="text-xs text-[var(--surface-text-muted)]">
            {{ ROLE_LABEL[item.role] }} · {{ item.beads }} 颗 · 约 {{ item.bags }} 袋
          </span>
        </button>

        <div class="space-y-2 text-xs">
          <div>
            <p class="m-0 mb-1 font-medium">① 替代（用已有色）</p>
            <div v-if="item.substitutes.length" class="flex flex-col gap-1">
              <button
                v-for="s in item.substitutes"
                :key="s.color.code"
                type="button"
                class="flex items-center gap-2 rounded border border-[var(--surface-border)] px-2 py-1 text-left hover:bg-[var(--surface-raised)]"
                @click="applySubstitute(item, s.color.code)"
              >
                <span
                  class="h-3 w-3 shrink-0 rounded-sm border border-black/20"
                  :style="{ background: s.color.hex }"
                />
                <span class="tabular">{{ s.color.code }}</span>
                <span class="ml-auto text-[var(--surface-text-muted)]">
                  ΔE {{ s.deltaE }} · {{ s.quality }}
                </span>
              </button>
            </div>
            <p v-else class="m-0 text-[var(--surface-text-muted)]">色板里暂无可替色</p>
          </div>

          <div>
            <p class="m-0 mb-0.5 font-medium">② 补货</p>
            <p class="m-0 text-[var(--surface-text-muted)]">
              建议买约 {{ item.bags }} 袋 {{ item.missing.code }}
              （含损耗估算，以商家规格为准）
            </p>
          </div>

          <div>
            <p class="m-0 mb-1 font-medium">③ 改图（排除后重跑）</p>
            <button
              type="button"
              class="rounded border border-[var(--surface-border)] px-2 py-1"
              @click="excludeAndRerun(item)"
            >
              排除 {{ item.missing.code }} 并重新生成
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
