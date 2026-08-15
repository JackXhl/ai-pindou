<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

const previewSize = computed(() => (props.compact ? 160 : 360));

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const size = previewSize.value;
  canvas.width = size;
  canvas.height = size;
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
    class="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-panel)] transition md:hover:-translate-y-0.5 md:hover:shadow-md"
  >
    <component
      :is="mode === 'inline' ? 'button' : 'a'"
      :href="mode === 'link' ? editorSampleUrl(id) : undefined"
      type="button"
      class="block w-full cursor-pointer border-0 bg-transparent p-0 text-left no-underline text-[var(--surface-text)]"
      @click="onActivate"
    >
      <div class="relative aspect-square bg-[var(--surface-raised)]">
        <canvas ref="canvasRef" class="block h-full w-full" />
        <div
          v-if="thumbError"
          class="absolute inset-0 flex items-center justify-center text-xs text-[var(--surface-text-muted)]"
        >
          预览加载失败
        </div>
      </div>
      <div :class="compact ? 'p-2.5' : 'p-3'">
        <div class="flex items-start justify-between gap-2">
          <h3 class="m-0 font-semibold" :class="compact ? 'text-xs' : 'text-sm'">
            {{ title }}
          </h3>
          <span
            class="shrink-0 rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--surface-text-muted)]"
          >
            {{ totalColors }} 色
          </span>
        </div>
        <p
          class="tabular m-0 mt-1 text-[var(--surface-text-muted)]"
          :class="compact ? 'text-[10px]' : 'text-xs'"
        >
          {{ cols }}×{{ rows }} · {{ totalBeads }} 颗 · {{ tag }}
        </p>
        <span
          class="mt-2 inline-block text-brand-500"
          :class="compact ? 'text-[10px]' : 'text-xs'"
        >
          同款 →
        </span>
      </div>
    </component>
  </li>
</template>
