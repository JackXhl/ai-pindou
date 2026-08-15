<script setup lang="ts">
import type { PaletteColor } from '@aipindou/registry';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { PatternRenderer, type Viewport } from '../../lib/canvas/renderer.js';

const props = defineProps<{
  grid: Uint16Array | null;
  cols: number;
  rows: number;
  colors: PaletteColor[];
  highlightValue?: number;
  majorGridEvery?: number;
  /** pan = 拖动画布；paint = 点击/拖动写格子 */
  interaction?: 'pan' | 'paint';
  craftCells?: Uint8Array | null;
  craftFocusColor?: number;
  craftActive?: boolean;
  showOutline?: boolean;
  mirrored?: boolean;
}>();

const emit = defineEmits<{
  hover: [cell: { col: number; row: number; value: number } | null];
  paint: [cell: { col: number; row: number }];
}>();

const container = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

// renderer 持有 Canvas 与大块位图，绝不能进响应式系统
const renderer = shallowRef<PatternRenderer | null>(null);
const viewport = shallowRef<Viewport>({ scale: 8, offsetX: 0, offsetY: 0 });

let resizeObserver: ResizeObserver | null = null;
let frameHandle = 0;

/** 合并同一帧内的多次重绘请求 */
function scheduleRender() {
  if (frameHandle) return;
  frameHandle = requestAnimationFrame(() => {
    frameHandle = 0;
    renderer.value?.render(viewport.value, {
      ...(props.highlightValue !== undefined
        ? { highlightValue: props.highlightValue }
        : {}),
      ...(props.majorGridEvery !== undefined
        ? { majorGridEvery: props.majorGridEvery }
        : {}),
      ...(props.showOutline ? { showOutline: true } : {}),
      ...(props.mirrored ? { mirrored: true } : {}),
      ...(props.craftActive && props.craftCells
        ? {
            craft: {
              cells: props.craftCells,
              focusColor: props.craftFocusColor ?? 0,
            },
          }
        : {}),
    });
  });
}

function applyPattern(fit: boolean) {
  const r = renderer.value;
  if (!r || !props.grid || props.cols === 0) return;
  r.setPattern(props.grid, props.cols, props.rows, props.colors);
  if (fit) viewport.value = r.fitViewport();
  scheduleRender();
}

function handleResize() {
  const r = renderer.value;
  const el = container.value;
  if (!r || !el) return;
  r.resize(el.clientWidth, el.clientHeight);
  scheduleRender();
}

/** 以指针位置为锚点缩放，这样用户放大的总是他正看着的地方 */
function zoomAt(cssX: number, cssY: number, factor: number) {
  const v = viewport.value;
  const next = Math.min(64, Math.max(0.5, v.scale * factor));
  if (next === v.scale) return;
  const ratio = next / v.scale;
  viewport.value = {
    scale: next,
    offsetX: cssX - (cssX - v.offsetX) * ratio,
    offsetY: cssY - (cssY - v.offsetY) * ratio,
  };
  scheduleRender();
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const rect = canvasEl.value?.getBoundingClientRect();
  if (!rect) return;
  // deltaY 的量纲随设备差异极大，取符号再用固定步长比直接用数值稳定
  zoomAt(
    event.clientX - rect.left,
    event.clientY - rect.top,
    event.deltaY < 0 ? 1.15 : 1 / 1.15,
  );
}

let dragging = false;
let painting = false;
let lastX = 0;
let lastY = 0;
let lastPaintKey = '';

function cellFromEvent(event: PointerEvent) {
  const rect = canvasEl.value?.getBoundingClientRect();
  const r = renderer.value;
  if (!rect || !r) return null;
  return r.hitTest(
    viewport.value,
    event.clientX - rect.left,
    event.clientY - rect.top,
    props.mirrored ?? false,
  );
}

function emitPaint(event: PointerEvent) {
  const hit = cellFromEvent(event);
  if (!hit) return;
  const key = `${hit.col},${hit.row}`;
  if (key === lastPaintKey) return;
  lastPaintKey = key;
  emit('paint', hit);
}

function onPointerDown(event: PointerEvent) {
  (event.target as Element).setPointerCapture(event.pointerId);
  if (props.interaction === 'paint') {
    painting = true;
    lastPaintKey = '';
    emitPaint(event);
    return;
  }
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
}

function onPointerMove(event: PointerEvent) {
  const rect = canvasEl.value?.getBoundingClientRect();
  if (!rect) return;

  if (painting) {
    emitPaint(event);
    return;
  }

  if (dragging) {
    const v = viewport.value;
    viewport.value = {
      scale: v.scale,
      offsetX: v.offsetX + (event.clientX - lastX),
      offsetY: v.offsetY + (event.clientY - lastY),
    };
    lastX = event.clientX;
    lastY = event.clientY;
    scheduleRender();
    return;
  }

  const r = renderer.value;
  if (!r || !props.grid) return;
  const hit = r.hitTest(
    viewport.value,
    event.clientX - rect.left,
    event.clientY - rect.top,
    props.mirrored ?? false,
  );
  emit(
    'hover',
    hit ? { ...hit, value: props.grid[hit.row * props.cols + hit.col] ?? 0 } : null,
  );
}

function onPointerUp(event: PointerEvent) {
  dragging = false;
  painting = false;
  lastPaintKey = '';
  (event.target as Element).releasePointerCapture?.(event.pointerId);
}

function fit() {
  const r = renderer.value;
  if (!r) return;
  viewport.value = r.fitViewport();
  scheduleRender();
}

defineExpose({ fit, zoomIn: () => zoomAt(0, 0, 1.25), zoomOut: () => zoomAt(0, 0, 0.8) });

onMounted(() => {
  if (!canvasEl.value || !container.value) return;
  renderer.value = new PatternRenderer(canvasEl.value);
  handleResize();
  applyPattern(true);

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (frameHandle) cancelAnimationFrame(frameHandle);
});

// 图纸尺寸变了才重新适配视口；仅格子内容变化（编辑）时保持当前视角
watch(
  () => [props.cols, props.rows] as const,
  () => applyPattern(true),
);
watch(
  () => props.grid,
  () => applyPattern(false),
);
watch(
  () => [
    props.highlightValue,
    props.majorGridEvery,
    props.showOutline,
    props.mirrored,
    props.craftCells,
    props.craftFocusColor,
    props.craftActive,
  ],
  scheduleRender,
);
</script>

<template>
  <div
    ref="container"
    class="relative h-full w-full overflow-hidden bg-[var(--canvas-bg)] touch-none"
  >
    <canvas
      ref="canvasEl"
      class="block"
      :class="
        interaction === 'paint'
          ? 'cursor-crosshair'
          : 'cursor-grab active:cursor-grabbing'
      "
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="emit('hover', null)"
    />
  </div>
</template>
