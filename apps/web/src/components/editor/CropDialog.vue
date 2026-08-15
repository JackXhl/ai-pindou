<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { cropImageData } from '../../lib/crop.js';

const props = defineProps<{ image: ImageData }>();
const emit = defineEmits<{
  confirm: [ImageData];
  skip: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const dragging = ref(false);
const start = ref({ x: 0, y: 0 });
const rect = ref({ x0: 0, y0: 0, x1: 0, y1: 0 });

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const maxW = 480;
  const scale = Math.min(1, maxW / props.image.width);
  canvas.width = Math.round(props.image.width * scale);
  canvas.height = Math.round(props.image.height * scale);
  const tmp = document.createElement('canvas');
  tmp.width = props.image.width;
  tmp.height = props.image.height;
  tmp.getContext('2d')!.putImageData(props.image, 0, 0);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);

  const { x0, y0, x1, y1 } = rect.value;
  const sx = Math.min(x0, x1) * scale;
  const sy = Math.min(y0, y1) * scale;
  const sw = Math.abs(x1 - x0) * scale;
  const sh = Math.abs(y1 - y0) * scale;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.clearRect(sx, sy, sw, sh);
  ctx.drawImage(tmp, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), sx, sy, sw, sh);
  ctx.strokeStyle = '#e8623f';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, sw, sh);
}

function toImage(clientX: number, clientY: number) {
  const canvas = canvasRef.value!;
  const r = canvas.getBoundingClientRect();
  const scaleX = props.image.width / canvas.width;
  const scaleY = props.image.height / canvas.height;
  return {
    x: ((clientX - r.left) / r.width) * canvas.width * scaleX,
    y: ((clientY - r.top) / r.height) * canvas.height * scaleY,
  };
}

function onDown(e: PointerEvent) {
  dragging.value = true;
  const p = toImage(e.clientX, e.clientY);
  start.value = p;
  rect.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  (e.target as Element).setPointerCapture(e.pointerId);
  draw();
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return;
  const p = toImage(e.clientX, e.clientY);
  rect.value = { x0: start.value.x, y0: start.value.y, x1: p.x, y1: p.y };
  draw();
}

function onUp() {
  dragging.value = false;
}

function confirm() {
  const { x0, y0, x1, y1 } = rect.value;
  if (Math.abs(x1 - x0) < 4 || Math.abs(y1 - y0) < 4) {
    emit('skip');
    return;
  }
  emit('confirm', cropImageData(props.image, x0, y0, x1, y1));
}

onMounted(() => {
  rect.value = {
    x0: props.image.width * 0.1,
    y0: props.image.height * 0.1,
    x1: props.image.width * 0.9,
    y1: props.image.height * 0.9,
  };
  draw();
});

watch(() => props.image, () => {
  rect.value = {
    x0: props.image.width * 0.1,
    y0: props.image.height * 0.1,
    x1: props.image.width * 0.9,
    y1: props.image.height * 0.9,
  };
  draw();
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div class="max-w-xl rounded bg-[var(--surface-panel)] p-4 text-[var(--surface-text)]">
      <h2 class="m-0 mb-2 text-base font-semibold">裁剪图片</h2>
      <p class="m-0 mb-3 text-xs text-[var(--surface-text-muted)]">
        拖拽调整选区。不需要裁剪可点「整图使用」。
      </p>
      <canvas
        ref="canvasRef"
        class="max-w-full touch-none"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
      />
      <div class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          class="rounded border border-[var(--surface-border)] px-3 py-1.5 text-sm"
          @click="emit('skip')"
        >
          整图使用
        </button>
        <button
          type="button"
          class="rounded bg-brand-500 px-3 py-1.5 text-sm text-white"
          @click="confirm"
        >
          确认裁剪
        </button>
      </div>
    </div>
  </div>
</template>
