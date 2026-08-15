<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  drawSamplePreview,
  editorSampleUrl,
  loadSample,
  type SampleMeta,
} from '../lib/samples.js';

const props = withDefaults(
  defineProps<
    SampleMeta & {
      compact?: boolean;
      /** link：跳转编辑器；inline：在当前页打开（编辑器内用） */
      mode?: 'link' | 'inline';
    }
  >(),
  { compact: false, mode: 'link' },
);

const emit = defineEmits<{
  select: [id: string];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const thumbError = ref(false);

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    const data = await loadSample(props.id);
    drawSamplePreview(canvas, data.grid, data.cols, data.rows, data.colors);
  } catch {
    thumbError.value = true;
  }
});

function onActivate() {
  if (props.mode === 'inline') {
    emit('select', props.id);
  }
}
</script>

<template>
  <li
    class="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-panel)]"
  >
    <component
      :is="mode === 'inline' ? 'button' : 'a'"
      :href="mode === 'link' ? editorSampleUrl(id) : undefined"
      type="button"
      class="block w-full cursor-pointer border-0 bg-transparent p-0 text-left no-underline text-[var(--surface-text)]"
      @click="onActivate"
    >
      <div class="relative bg-[var(--surface-raised)]" :class="compact ? 'h-24' : 'h-32'">
        <canvas
          ref="canvasRef"
          class="absolute inset-0 block h-full w-full"
          width="160"
          height="128"
        />
        <div
          v-if="thumbError"
          class="absolute inset-0 flex items-center justify-center text-xs text-[var(--surface-text-muted)]"
        >
          预览加载失败
        </div>
      </div>
      <div class="p-3">
        <div class="flex items-start justify-between gap-2">
          <h3 class="m-0 text-sm font-semibold">{{ title }}</h3>
          <span
            class="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] text-[var(--surface-text-muted)]"
          >
            {{ tag }}
          </span>
        </div>
        <p class="tabular m-0 mt-1 text-xs text-[var(--surface-text-muted)]">
          {{ cols }}×{{ rows }} · {{ totalColors }} 色 · {{ totalBeads }} 颗
        </p>
        <span class="mt-2 inline-block text-xs text-brand-500">打开同款 →</span>
      </div>
    </component>
  </li>
</template>
