<script setup lang="ts">
import { PALETTE_INDEX, describeSize, BEAD_UNITS } from '@aipindou/registry';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  downloadBomCsv,
  downloadPatternPdf,
  downloadPatternPng,
} from '../../lib/export/index.js';
import {
  ImageDecodeError,
  decodeImageFile,
  imageFileFromClipboard,
  imageFileFromDrop,
  suggestGridSize,
} from '../../lib/image.js';
import { applySampleToEditor, loadSample } from '../../lib/samples.js';
import { ROUTES } from '../../lib/url.js';
import { useCraftStore } from '../../stores/craft.js';
import { useDraftStore } from '../../stores/drafts.js';
import { useEditStore } from '../../stores/edit.js';
import { useMyPaletteStore } from '../../stores/myPalette.js';
import { usePatternStore } from '../../stores/pattern.js';
import { useSettingsStore } from '../../stores/settings.js';
import SamplePatternGrid from '../SamplePatternGrid.vue';
import CropDialog from './CropDialog.vue';
import MissingColorPanel from './MissingColorPanel.vue';
import MyPalettePanel from './MyPalettePanel.vue';
import PatternCanvas from './PatternCanvas.vue';

const settings = useSettingsStore();
const pattern = usePatternStore();
const myPalette = useMyPaletteStore();
const edit = useEditStore();
const craft = useCraftStore();
const drafts = useDraftStore();

// 原图像素不进响应式：一张 2048×2048 的 ImageData 有 16MB，
// 被 Vue 代理会带来毫无意义的开销
const source = shallowRef<ImageData | null>(null);
const pendingCrop = shallowRef<ImageData | null>(null);
const fileName = ref('');
const uploadError = ref('');
const isDragging = ref(false);
const highlightValue = ref<number | undefined>(undefined);
const hoverCell = ref<{ col: number; row: number; value: number } | null>(null);
const longestSide = ref(58);
const draftOpen = ref(false);
const autosaveOffer = ref(false);

const canvasRef = ref<InstanceType<typeof PatternCanvas> | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const exportOpen = ref(false);
const exportBusy = ref(false);
const exportError = ref('');
const mirroredExport = ref(false);

const palettes = computed(() => PALETTE_INDEX);
const canExport = computed(() => pattern.hasPattern && pattern.bom !== null);
const currentPaletteSets = computed(
  () => PALETTE_INDEX.find((p) => p.id === settings.prefs.paletteId)?.sets ?? [],
);
const setGuide = ref('选档位后请到「我的色板」勾选你实际拥有的色号，我们不会伪造套装清单。');

function guideSetTier(count: number) {
  myPalette.state.enabled = true;
  myPalette.state.setCount = count;
  mobileTab.value = 'params';
  setGuide.value = `已选约 ${count} 色档。商家套装色号无公开可靠清单，请在下方「我的色板」勾选或导入你手上的色号后再生成。`;
}

const sizeInfo = computed(() =>
  describeSize(
    settings.prefs.cols,
    settings.prefs.rows,
    BEAD_UNITS[settings.prefs.unitId],
  ),
);

const exportMeta = computed(() => {
  const paletteMeta = PALETTE_INDEX.find((p) => p.id === settings.prefs.paletteId);
  return {
    sizeLabel: `${sizeInfo.value.cols}×${sizeInfo.value.rows} 格 · ${sizeInfo.value.widthCm}×${sizeInfo.value.heightCm} cm · ${sizeInfo.value.boards} 块底板`,
    paletteVersion: paletteMeta?.version ?? settings.prefs.paletteId,
    beadSizeLabel: settings.unit.label,
    beadWidthMm: settings.unit.widthMm,
    basename: fileName.value.replace(/\.[^.]+$/, '') || '拼豆图纸',
  };
});

/** 悬停格子的色号，显示在状态栏 */
const hoverColor = computed(() => {
  const cell = hoverCell.value;
  if (!cell || cell.value === 0) return null;
  return pattern.colors[cell.value - 1] ?? null;
});

let debounceHandle = 0;

/** 参数改动后延迟再生成：拖滑块时会连续触发，每次都跑一遍管线毫无必要 */
function scheduleGenerate(delay = 220) {
  window.clearTimeout(debounceHandle);
  debounceHandle = window.setTimeout(runGenerate, delay);
}

function runGenerate() {
  const image = source.value;
  if (!image) return;

  if (myPalette.state.enabled && (myPalette.availableCodes?.length ?? 0) === 0) {
    pattern.setError('已开启「只用我有的颜色」，但色板为空。请先勾选或导入色号。');
    return;
  }

  edit.resetHistory();
  pattern.requestGenerate({
    image,
    paletteId: settings.prefs.paletteId,
    ...(myPalette.availableCodes
      ? { availableCodes: myPalette.availableCodes }
      : {}),
    options: {
      cols: settings.prefs.cols,
      rows: settings.prefs.rows,
      sampleMode: settings.prefs.sampleMode,
      denoise: settings.denoise,
      maxColors: settings.prefs.maxColors,
      removeBackground: settings.prefs.removeBackground,
      dither: settings.prefs.dither,
      ditherAmount: 0.65,
    },
  });
}

function applySourceAndGenerate(image: ImageData) {
  source.value = image;
  const suggested = suggestGridSize(image.width, image.height, longestSide.value);
  settings.setSize(suggested.cols, suggested.rows);
  runGenerate();
}

async function loadFile(file: File) {
  uploadError.value = '';
  try {
    const decoded = await decodeImageFile(file);
    fileName.value = file.name;
    pendingCrop.value = decoded.imageData;
  } catch (error) {
    uploadError.value =
      error instanceof ImageDecodeError
        ? error.message
        : '读取图片时出错，请换一张试试。';
  }
}

function onCropConfirm(image: ImageData) {
  pendingCrop.value = null;
  applySourceAndGenerate(image);
}

function onCropSkip() {
  const image = pendingCrop.value;
  pendingCrop.value = null;
  if (image) applySourceAndGenerate(image);
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void loadFile(file);
  input.value = '';
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  const file = imageFileFromDrop(event);
  if (file) void loadFile(file);
}

function onPaste(event: ClipboardEvent) {
  const file = imageFileFromClipboard(event);
  if (file) void loadFile(file);
}

async function openSamplePattern(id: string) {
  uploadError.value = '';
  autosaveOffer.value = false;
  try {
    const data = await loadSample(id);
    const applied = applySampleToEditor(data);
    settings.setPalette(applied.paletteId);
    settings.setSize(applied.cols, applied.rows);
    pattern.loadFromDraft({
      cols: applied.cols,
      rows: applied.rows,
      grid: applied.grid,
      colors: applied.colors,
      bom: applied.bom,
    });
    fileName.value = data.title;
    source.value = null;
    edit.resetHistory();
    craft.stop();
    mobileTab.value = 'canvas';
    requestAnimationFrame(() => canvasRef.value?.fit());
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '样例加载失败';
  }
}

function toggleHighlight(value: number) {
  highlightValue.value = highlightValue.value === value ? undefined : value;
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign(ROUTES.home());
}

async function restorePendingAutosave() {
  const ok = await drafts.restoreAutosave();
  if (ok) {
    autosaveOffer.value = false;
    fileName.value = fileName.value || '已恢复草稿';
  }
}

async function dismissPendingAutosave() {
  await drafts.discardAutosave();
  autosaveOffer.value = false;
}

async function checkAutosaveOffer() {
  autosaveOffer.value = await drafts.hasAutosave();
}

const mobileTab = ref<'canvas' | 'params' | 'bom'>('canvas');
const moreOpen = ref(false);
const craftPickIndex = ref<number | null>(null);

const editTools = [
  { id: 'pan', label: '平移' },
  { id: 'paint', label: '画笔' },
  { id: 'erase', label: '橡皮' },
  { id: 'eyedropper', label: '吸管' },
  { id: 'fill', label: '油漆桶' },
  { id: 'wand', label: '魔棒' },
] as const;

const canvasInteraction = computed(() =>
  craft.active || edit.tool !== 'pan' ? 'paint' : 'pan',
);

function onCanvasPaint(cell: { col: number; row: number }) {
  if (craft.active && pattern.cols > 0) {
    const index = cell.row * pattern.cols + cell.col;
    if (craft.focusColor > 0 && pattern.grid) {
      if (pattern.grid[index] !== craft.focusColor) return;
    }
    craftPickIndex.value = index;
    // 桌面：点击直接切换；移动端靠大按钮确认，降低误触
    const isCoarse =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarse) craft.toggleCell(index);
    return;
  }
  if (edit.tool === 'wand') {
    const value = pattern.grid?.[cell.row * pattern.cols + cell.col] ?? 0;
    if (value > 0) {
      highlightValue.value = value;
      edit.setBrushFromColorIndex(value);
    }
    return;
  }
  edit.applyCell(cell.col, cell.row);
}

function markCraftPicked() {
  if (craftPickIndex.value === null) return;
  craft.markDone(craftPickIndex.value);
}

function toggleCraftMode() {
  if (!pattern.hasPattern || !pattern.grid) return;
  if (craft.active) {
    craft.stop();
    return;
  }
  const key = `${settings.prefs.paletteId}:${pattern.cols}x${pattern.rows}:${pattern.totalCells}`;
  craft.start(key, pattern.grid.length);
  edit.setTool('pan');
}

function onBomClick(value: number) {
  if (craft.active) {
    craft.setFocusColor(value);
    highlightValue.value = value;
    return;
  }
  if (edit.tool === 'paint' || edit.tool === 'eyedropper' || edit.tool === 'fill') {
    edit.setBrushFromColorIndex(value);
    if (edit.tool === 'eyedropper') edit.setTool('paint');
    return;
  }
  toggleHighlight(value);
}

const craftRemaining = computed(() =>
  craft.active ? craft.remainingFor(pattern.grid) : 0,
);

function replaceHighlightWithBrush() {
  if (highlightValue.value === undefined || edit.brushValue <= 0) return;
  edit.replaceColor(highlightValue.value, edit.brushValue);
}

function changeLongestSide(value: number) {
  longestSide.value = value;
  const image = source.value;
  if (!image) return;
  const suggested = suggestGridSize(image.width, image.height, value);
  settings.setSize(suggested.cols, suggested.rows);
  scheduleGenerate(0);
}

function requireExportPayload() {
  if (!pattern.grid || !pattern.bom) {
    throw new Error('请先生成图纸再导出。');
  }
  return {
    grid: pattern.grid,
    cols: pattern.cols,
    rows: pattern.rows,
    colors: pattern.colors,
    bom: pattern.bom,
    mirrored: mirroredExport.value,
    ...exportMeta.value,
  };
}

async function runExport(kind: 'png' | 'pdf' | 'csv') {
  if (!canExport.value || exportBusy.value) return;
  exportBusy.value = true;
  exportError.value = '';
  try {
    if (kind === 'csv') {
      downloadBomCsv(pattern.bom!, {
        paletteVersion: exportMeta.value.paletteVersion,
        sizeLabel: exportMeta.value.sizeLabel,
        basename: `${exportMeta.value.basename}-用料`,
      });
    } else if (kind === 'png') {
      await downloadPatternPng({ ...requireExportPayload(), mode: 'both' });
    } else {
      await downloadPatternPdf({ ...requireExportPayload(), mode: 'both' });
    }
    exportOpen.value = false;
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败';
  } finally {
    exportBusy.value = false;
  }
}

watch(
  () => [
    settings.prefs.paletteId,
    settings.prefs.simplify,
    settings.prefs.sampleMode,
    settings.prefs.maxColors,
    settings.prefs.removeBackground,
    settings.prefs.dither,
    myPalette.state.enabled,
    myPalette.availableCodes?.join(','),
  ],
  () => {
    settings.persist();
    scheduleGenerate();
  },
);

watch(
  () => settings.canvasView,
  () => {
    settings.persistCanvasView();
  },
  { deep: true },
);

function onDocClick(event: MouseEvent) {
  if (!(event.target instanceof Node)) return;
  const root = document.querySelector('[data-editor-more]');
  if (root && !root.contains(event.target)) moreOpen.value = false;
}

onMounted(() => {
  window.addEventListener('paste', onPaste);
  document.addEventListener('click', onDocClick);
  void drafts.refresh();
  const sampleId = new URLSearchParams(window.location.search).get('sample');
  if (sampleId) {
    void openSamplePattern(sampleId);
  } else {
    void checkAutosaveOffer();
  }
  window.addEventListener('beforeunload', () => {
    void drafts.autosave();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste);
  document.removeEventListener('click', onDocClick);
  window.clearTimeout(debounceHandle);
  void drafts.autosave();
  pattern.dispose();
});
</script>

<template>
  <div class="flex h-[100dvh] flex-col bg-[var(--surface-base)] text-[var(--surface-text)]">
    <div class="sticky top-0 z-30 shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]">
      <header class="flex h-12 items-center gap-2 px-3 md:h-auto md:gap-3 md:px-4 md:py-2">
        <button
          type="button"
          class="shrink-0 rounded border border-[var(--surface-border)] px-2.5 py-1 text-sm hover:bg-[var(--surface-raised)]"
          aria-label="返回上一页"
          @click="goBack"
        >
          ← 返回
        </button>
        <a
          :href="ROUTES.home()"
          class="hidden shrink-0 text-sm font-semibold text-[var(--surface-text)] no-underline sm:inline"
        >
          爱拼豆
        </a>
        <span class="min-w-0 flex-1 truncate text-sm text-[var(--surface-text-muted)]">
          {{ fileName || '未选择图片' }}
        </span>

        <!-- 桌面：工具 + 操作横排 -->
        <div class="ml-auto hidden items-center gap-2 md:flex">
          <div class="mr-1 flex flex-wrap items-center gap-1">
            <button
              v-for="t in editTools"
              :key="t.id"
              type="button"
              class="rounded border px-2 py-1 text-xs"
              :class="
                edit.tool === t.id
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-[var(--surface-border)]'
              "
              :disabled="craft.active"
              @click="edit.setTool(t.id)"
            >
              {{ t.label }}
            </button>
            <button
              type="button"
              class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs disabled:opacity-40"
              :disabled="edit.undoStack.length === 0"
              @click="edit.undo()"
            >
              撤销
            </button>
            <button
              type="button"
              class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs disabled:opacity-40"
              :disabled="edit.redoStack.length === 0"
              @click="edit.redo()"
            >
              重做
            </button>
          </div>
          <button
            type="button"
            class="rounded-[var(--radius-control)] border px-3 py-1.5 text-sm disabled:opacity-40"
            :class="
              craft.active
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-[var(--surface-border)]'
            "
            :disabled="!pattern.hasPattern"
            @click="toggleCraftMode"
          >
            {{ craft.active ? `摆豆中 ${craft.doneCount}` : '摆豆模式' }}
          </button>
          <button
            type="button"
            class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 text-sm disabled:opacity-40"
            :disabled="!pattern.hasPattern"
            @click="void drafts.saveNamed()"
          >
            保存草稿
          </button>
          <button
            type="button"
            class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 text-sm"
            @click="draftOpen = !draftOpen; void drafts.refresh()"
          >
            打开草稿
          </button>
          <button
            type="button"
            class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 text-sm disabled:opacity-40"
            :disabled="!canExport"
            @click="exportOpen = !exportOpen"
          >
            导出
          </button>
          <button
            type="button"
            class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 text-sm"
            @click="canvasRef?.fit()"
          >
            适应窗口
          </button>
          <button
            type="button"
            class="rounded-[var(--radius-control)] bg-brand-500 px-3 py-1.5 text-sm text-white"
            @click="fileInput?.click()"
          >
            {{ source || pattern.hasPattern ? '换一张图' : '选择图片' }}
          </button>
        </div>

        <!-- 手机：主操作 + 更多 -->
        <div
          class="relative flex shrink-0 items-center gap-1.5 md:hidden"
          data-editor-more
          @click.stop
        >
          <button
            type="button"
            class="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-medium text-white"
            @click="fileInput?.click()"
          >
            {{ source || pattern.hasPattern ? '换图' : '选图' }}
          </button>
          <button
            type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--surface-border)] text-sm"
            :aria-expanded="moreOpen"
            aria-haspopup="menu"
            aria-label="更多操作"
            @click="moreOpen = !moreOpen"
          >
            ···
          </button>
          <div
            v-if="moreOpen"
            class="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-lg"
            role="menu"
          >
            <button
              type="button"
              class="flex w-full px-3 py-2.5 text-left text-sm disabled:opacity-40"
              :disabled="!pattern.hasPattern"
              role="menuitem"
              @click="moreOpen = false; toggleCraftMode()"
            >
              {{ craft.active ? '退出摆豆' : '摆豆模式' }}
            </button>
            <button
              type="button"
              class="flex w-full px-3 py-2.5 text-left text-sm disabled:opacity-40"
              :disabled="!pattern.hasPattern"
              role="menuitem"
              @click="moreOpen = false; void drafts.saveNamed()"
            >
              保存草稿
            </button>
            <button
              type="button"
              class="flex w-full px-3 py-2.5 text-left text-sm"
              role="menuitem"
              @click="moreOpen = false; draftOpen = !draftOpen; void drafts.refresh()"
            >
              打开草稿
            </button>
            <button
              type="button"
              class="flex w-full px-3 py-2.5 text-left text-sm disabled:opacity-40"
              :disabled="!canExport"
              role="menuitem"
              @click="moreOpen = false; exportOpen = !exportOpen"
            >
              导出
            </button>
            <button
              type="button"
              class="flex w-full px-3 py-2.5 text-left text-sm"
              role="menuitem"
              @click="moreOpen = false; canvasRef?.fit()"
            >
              适应窗口
            </button>
          </div>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileChange"
        />
      </header>

      <!-- 手机工具条：横向滑动，避免挤成竖排 -->
      <div
        class="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
        aria-label="画布工具"
      >
        <button
          v-for="t in editTools"
          :key="t.id"
          type="button"
          class="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs"
          :class="
            edit.tool === t.id
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-[var(--surface-border)]'
          "
          :disabled="craft.active"
          @click="edit.setTool(t.id)"
        >
          {{ t.label }}
        </button>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-[var(--surface-border)] px-2.5 py-1.5 text-xs disabled:opacity-40"
          :disabled="edit.undoStack.length === 0"
          @click="edit.undo()"
        >
          撤销
        </button>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-[var(--surface-border)] px-2.5 py-1.5 text-xs disabled:opacity-40"
          :disabled="edit.redoStack.length === 0"
          @click="edit.redo()"
        >
          重做
        </button>
      </div>
    </div>

    <div
      v-if="craft.active"
      class="flex flex-wrap items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-2 text-sm"
    >
      <span class="tabular">{{ craft.summary }}</span>
      <span class="tabular text-[var(--surface-text-muted)]">
        剩余 {{ craftRemaining }} 颗
        <template v-if="craft.focusColor > 0">
          （单色 {{ pattern.colors[craft.focusColor - 1]?.code }}）
        </template>
      </span>
      <div
        class="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-raised)]"
        role="progressbar"
        :aria-valuenow="Math.round(craft.progressRatio * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full bg-brand-500 transition-[width]"
          :style="{ width: `${Math.round(craft.progressRatio * 100)}%` }"
        />
      </div>
      <button
        type="button"
        class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs"
        @click="craft.setFocusColor(0)"
      >
        显示全部色
      </button>
      <button
        type="button"
        class="min-h-11 flex-1 rounded-[var(--radius-control)] bg-brand-500 px-4 py-2.5 text-base font-medium text-white disabled:opacity-40 sm:flex-none sm:text-sm"
        :disabled="craftPickIndex === null"
        @click="markCraftPicked"
      >
        标记完成
      </button>
      <span class="hidden text-xs text-[var(--surface-text-muted)] sm:inline">
        点击用料色号进入单色作业；桌面点击格子切换，手机先点格再按标记完成
      </span>
    </div>

    <div
      v-if="draftOpen"
      class="max-h-48 overflow-y-auto border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-2 text-sm"
    >
      <p v-if="drafts.status" class="m-0 mb-2 text-xs text-[var(--surface-text-muted)]">
        {{ drafts.status }}
      </p>
      <ul v-if="drafts.items.length" class="m-0 list-none space-y-1 p-0">
        <li
          v-for="d in drafts.items"
          :key="d.id"
          class="flex items-center gap-2"
        >
          <button
            type="button"
            class="flex-1 rounded border border-[var(--surface-border)] px-2 py-1.5 text-left hover:bg-[var(--surface-raised)]"
            @click="
              void drafts.load(d.id).then((ok) => {
                if (ok) {
                  fileName = d.title;
                  draftOpen = false;
                  source = null;
                }
              })
            "
          >
            <span class="block font-medium">{{ d.title }}</span>
            <span class="text-xs text-[var(--surface-text-muted)]">
              {{ d.cols }}×{{ d.rows }} · {{ new Date(d.updatedAt).toLocaleString('zh-CN') }}
            </span>
          </button>
          <button
            type="button"
            class="rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-[var(--color-danger)]"
            @click="void drafts.remove(d.id)"
          >
            删除
          </button>
        </li>
      </ul>
      <p v-else class="m-0 text-[var(--surface-text-muted)]">暂无已保存草稿</p>
    </div>

    <div
      v-if="exportOpen"
      class="flex flex-wrap items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-2 text-sm"
    >
      <label class="flex items-center gap-2">
        <input v-model="mirroredExport" type="checkbox" />
        镜像版（胶带法翻面用）
      </label>
      <button
        type="button"
        class="rounded-[var(--radius-control)] bg-brand-500 px-3 py-1.5 text-white disabled:opacity-40"
        :disabled="exportBusy"
        @click="runExport('png')"
      >
        下载 PNG
      </button>
      <button
        type="button"
        class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 disabled:opacity-40"
        :disabled="exportBusy"
        @click="runExport('pdf')"
      >
        下载 PDF
      </button>
      <button
        type="button"
        class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-3 py-1.5 disabled:opacity-40"
        :disabled="exportBusy"
        @click="runExport('csv')"
      >
        下载用料 CSV
      </button>
      <span v-if="exportBusy" class="text-[var(--surface-text-muted)]">导出中…</span>
      <span v-if="exportError" class="text-[var(--color-danger)]">{{ exportError }}</span>
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- 左：参数（桌面常驻；手机用底部切换） -->
      <aside
        class="w-72 shrink-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface-panel)] p-4"
        :class="mobileTab === 'params' ? 'fixed inset-x-0 bottom-14 top-[5.75rem] z-20 block md:static md:z-auto md:top-auto md:bottom-auto' : 'hidden md:block'"
      >
        <section class="mb-6">
          <h2 class="m-0 mb-2 text-sm font-semibold">成品尺寸</h2>
          <div class="flex gap-2">
            <button
              v-for="preset in [29, 58, 87, 116]"
              :key="preset"
              type="button"
              class="flex-1 rounded-[var(--radius-control)] border px-2 py-1.5 text-sm"
              :class="
                longestSide === preset
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-[var(--surface-border)]'
              "
              @click="changeLongestSide(preset)"
            >
              {{ preset }}
            </button>
          </div>
          <p class="tabular m-0 mt-2 text-xs text-[var(--surface-text-muted)]">
            {{ sizeInfo.cols }}×{{ sizeInfo.rows }} 格 ·
            {{ sizeInfo.widthCm }}×{{ sizeInfo.heightCm }} cm ·
            {{ sizeInfo.boards }} 块底板
          </p>
        </section>

        <section class="mb-6">
          <h2 class="m-0 mb-2 text-sm font-semibold">色卡</h2>
          <select
            v-model="settings.prefs.paletteId"
            class="w-full rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1.5 text-sm"
          >
            <option v-for="p in palettes" :key="p.id" :value="p.id">
              {{ p.brand }} · {{ p.count }} 色
            </option>
          </select>

          <h2 class="m-0 mb-2 mt-4 text-sm font-semibold">豆径</h2>
          <div class="flex gap-2">
            <button
              v-for="(unit, id) in BEAD_UNITS"
              :key="id"
              type="button"
              class="flex-1 rounded-[var(--radius-control)] border px-2 py-1.5 text-sm"
              :class="
                settings.prefs.unitId === id
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-[var(--surface-border)]'
              "
              @click="settings.setUnit(id)"
            >
              {{ unit.widthMm }}mm
            </button>
          </div>
        </section>

        <section class="mb-6">
          <label class="mb-1 block text-sm font-semibold" for="simplify">
            细节与简化
          </label>
          <input
            id="simplify"
            v-model.number="settings.prefs.simplify"
            type="range"
            min="0"
            max="100"
            step="5"
            class="w-full"
          />
          <p class="m-0 text-xs text-[var(--surface-text-muted)]">
            往左保留更多细节，往右减少零星色号、更好摆。
          </p>
        </section>

        <section class="mb-6">
          <h2 class="m-0 mb-2 text-sm font-semibold">采样与抖动</h2>
          <label class="mb-1 block text-xs text-[var(--surface-text-muted)]" for="sampleMode">
            采样模式
          </label>
          <select
            id="sampleMode"
            v-model="settings.prefs.sampleMode"
            class="mb-3 w-full rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1.5 text-sm"
          >
            <option value="auto">自动</option>
            <option value="smooth">平滑平均</option>
            <option value="dominant">主色优先</option>
          </select>
          <label class="mb-1 block text-xs text-[var(--surface-text-muted)]" for="maxColors">
            最大色数（0 = 不限制）
          </label>
          <input
            id="maxColors"
            v-model.number="settings.prefs.maxColors"
            type="number"
            min="0"
            max="200"
            class="mb-3 w-full rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1.5 text-sm"
          />
          <label class="flex items-center gap-2 text-sm">
            <input v-model="settings.prefs.dither" type="checkbox" />
            抖动（渐变更平滑，色号可能更碎）
          </label>
        </section>

        <section v-if="currentPaletteSets.length" class="mb-6">
          <h2 class="m-0 mb-2 text-sm font-semibold">套装档位</h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="count in currentPaletteSets"
              :key="count"
              type="button"
              class="rounded-[var(--radius-control)] border border-[var(--surface-border)] px-2 py-1.5 text-sm"
              @click="guideSetTier(count)"
            >
              {{ count }} 色
            </button>
          </div>
          <p class="m-0 mt-2 text-xs text-[var(--surface-text-muted)]">
            {{ setGuide }}
          </p>
        </section>

        <section class="mb-6">
          <h2 class="m-0 mb-2 text-sm font-semibold">画布显示</h2>
          <label class="mb-2 flex items-center gap-2 text-sm">
            <input v-model="settings.canvasView.showOutline" type="checkbox" />
            描边（格子边界更清晰）
          </label>
          <label class="mb-2 flex items-center gap-2 text-sm">
            <input v-model="settings.canvasView.mirrorPreview" type="checkbox" />
            镜像预览（胶带法对照）
          </label>
          <label class="mb-1 block text-xs text-[var(--surface-text-muted)]" for="majorGrid">
            粗辅助线间隔（格）
          </label>
          <select
            id="majorGrid"
            v-model.number="settings.canvasView.majorGridEvery"
            class="w-full rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1.5 text-sm"
          >
            <option :value="10">每 10 格</option>
            <option :value="29">每 29 格（标准底板）</option>
            <option :value="52">每 52 格（大板）</option>
          </select>
        </section>

        <section>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="settings.prefs.removeBackground" type="checkbox" />
            去掉纯色背景
          </label>
        </section>

        <MyPalettePanel class="mt-6" />
        <MissingColorPanel
          class="mt-6"
          @rerun="runGenerate"
          @highlight="(v) => (highlightValue = v)"
        />
      </aside>

      <!-- 中：画布 -->
      <main
        class="relative min-w-0 flex-1"
        :class="mobileTab === 'canvas' ? 'block' : 'hidden md:block'"
      >
        <div
          v-if="!source && !pattern.hasPattern"
          class="h-full overflow-y-auto p-4 md:p-6"
          :class="isDragging ? 'bg-[var(--surface-raised)]' : ''"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop="onDrop"
        >
          <div class="mx-auto max-w-2xl px-1 text-center md:px-0">
            <div
              v-if="autosaveOffer"
              class="mb-6 rounded-[var(--radius-card)] border border-[var(--surface-border)] bg-[var(--surface-panel)] p-4 text-left"
            >
              <p class="m-0 text-sm">检测到上次未保存的草稿，要恢复还是重新开始？</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="min-h-11 flex-1 rounded-[var(--radius-control)] bg-brand-500 px-4 py-2 text-sm text-white sm:flex-none"
                  @click="void restorePendingAutosave()"
                >
                  恢复草稿
                </button>
                <button
                  type="button"
                  class="min-h-11 flex-1 rounded-[var(--radius-control)] border border-[var(--surface-border)] px-4 py-2 text-sm sm:flex-none"
                  @click="void dismissPendingAutosave()"
                >
                  丢弃，选新样例
                </button>
              </div>
            </div>
            <h1 class="m-0 text-lg md:text-xl">把图片拖进来，或者直接粘贴</h1>
            <p class="mt-2 text-sm text-[var(--surface-text-muted)]">
              支持 JPG、PNG、WebP。图片只在你的浏览器里处理，不会上传到服务器。
            </p>
            <button
              type="button"
              class="mt-4 min-h-11 w-full max-w-xs rounded-full bg-brand-500 px-5 py-2.5 text-white sm:w-auto sm:rounded-[var(--radius-control)]"
              @click="fileInput?.click()"
            >
              选择图片
            </button>
            <p v-if="uploadError" class="mt-3 text-sm text-[var(--color-danger)]">
              {{ uploadError }}
            </p>
          </div>
          <div class="mx-auto mt-10 max-w-3xl">
            <h2 class="m-0 mb-1 text-center text-sm font-semibold">或从精选样例开始</h2>
            <p class="m-0 mb-4 text-center text-xs text-[var(--surface-text-muted)]">
              一键打开同款图纸，可继续编辑、导出与摆豆
            </p>
            <SamplePatternGrid
              featured-only
              :limit="4"
              compact
              mode="inline"
              @select="openSamplePattern"
            />
          </div>
        </div>

        <PatternCanvas
          v-else-if="pattern.hasPattern"
          ref="canvasRef"
          :grid="pattern.grid"
          :cols="pattern.cols"
          :rows="pattern.rows"
          :colors="pattern.colors"
          :highlight-value="highlightValue"
          :interaction="canvasInteraction"
          :craft-active="craft.active"
          :craft-cells="craft.cells"
          :craft-focus-color="craft.focusColor"
          :show-outline="settings.canvasView.showOutline"
          :mirrored="settings.canvasView.mirrorPreview"
          :major-grid-every="settings.canvasView.majorGridEvery"
          @hover="hoverCell = $event"
          @paint="onCanvasPaint"
        />

        <div
          v-if="pattern.status === 'generating'"
          class="absolute inset-x-0 top-0 bg-brand-500 px-4 py-1 text-center text-sm text-white"
        >
          正在生成…
        </div>
        <div
          v-else-if="pattern.status === 'error'"
          class="absolute inset-x-0 top-0 bg-[var(--color-danger)] px-4 py-1 text-center text-sm text-white"
        >
          {{ pattern.errorMessage }}
        </div>
      </main>

      <!-- 右：用料清单 -->
      <aside
        class="w-72 shrink-0 overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--surface-panel)] p-4"
        :class="mobileTab === 'bom' ? 'fixed inset-x-0 bottom-14 top-[5.75rem] z-20 block lg:static lg:top-auto lg:bottom-auto lg:z-auto' : 'hidden lg:block'"
      >
        <h2 class="m-0 mb-1 text-sm font-semibold">用料清单</h2>
        <p
          v-if="pattern.bom"
          class="tabular m-0 mb-3 text-xs text-[var(--surface-text-muted)]"
        >
          {{ pattern.bom.totalColors }} 个色号 · {{ pattern.bom.totalBeads }} 颗 ·
          约 {{ pattern.bom.totalBags }} 袋
        </p>
        <p
          v-if="craft.active"
          class="m-0 mb-2 text-xs text-[var(--surface-text-muted)]"
        >
          摆豆：点击色号只盯一色；再点取消焦点。
        </p>
        <p
          v-else-if="edit.tool === 'paint' || edit.tool === 'fill'"
          class="m-0 mb-2 text-xs text-[var(--surface-text-muted)]"
        >
          {{ edit.tool === 'fill' ? '油漆桶：先选色再点连通区域。' : '画笔色：点击下方色号选取；' }}
          <button
            type="button"
            class="ml-1 underline disabled:opacity-40"
            :disabled="highlightValue === undefined || edit.brushValue <= 0"
            @click="replaceHighlightWithBrush"
          >
            高亮换色
          </button>
        </p>
        <p
          v-else-if="edit.tool === 'wand'"
          class="m-0 mb-2 text-xs text-[var(--surface-text-muted)]"
        >
          魔棒：点击格子选中同色，再选画笔色后点「高亮换色」。
          <button
            type="button"
            class="ml-1 underline disabled:opacity-40"
            :disabled="highlightValue === undefined || edit.brushValue <= 0"
            @click="replaceHighlightWithBrush"
          >
            高亮换色
          </button>
        </p>

        <ul v-if="pattern.bom" class="m-0 list-none p-0">
          <li
            v-for="entry in pattern.bom.entries"
            :key="entry.color.code"
            class="mb-0.5"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm"
              :class="
                highlightValue === entry.gridValue || edit.brushValue === entry.gridValue
                  ? 'bg-[var(--surface-raised)]'
                  : 'hover:bg-[var(--surface-raised)]'
              "
              @click="onBomClick(entry.gridValue)"
            >
              <span
                class="h-4 w-4 shrink-0 rounded-sm border border-black/20"
                :style="{ background: entry.color.hex }"
              />
              <span class="tabular w-12 shrink-0">{{ entry.color.code }}</span>
              <span class="tabular ml-auto text-[var(--surface-text-muted)]">
                {{ entry.beads }} 颗
              </span>
              <span class="tabular w-10 shrink-0 text-right">
                {{ entry.bags }} 袋
              </span>
            </button>
          </li>
        </ul>

        <p
          v-if="pattern.bom"
          class="m-0 mt-3 text-xs text-[var(--surface-text-muted)]"
        >
          袋数按每袋约 1000 粒、含 10% 损耗估算，实际以商家规格为准。
        </p>
      </aside>
    </div>

    <!-- 手机底部工具条 -->
    <nav
      class="flex shrink-0 border-t border-[var(--surface-border)] bg-[var(--surface-panel)] md:hidden"
      aria-label="移动端导航"
    >
      <button
        v-for="tab in [
          { id: 'params', label: '参数' },
          { id: 'canvas', label: '画布' },
          { id: 'bom', label: '用料' },
        ] as const"
        :key="tab.id"
        type="button"
        class="flex-1 py-3 text-sm"
        :class="
          mobileTab === tab.id
            ? 'text-brand-500'
            : 'text-[var(--surface-text-muted)]'
        "
        @click="mobileTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 常驻状态栏：坐标与色号必须一直看得见，而不是藏在悬浮提示里 -->
    <footer
      class="hidden shrink-0 items-center gap-4 border-t border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-1.5 text-xs text-[var(--surface-text-muted)] sm:flex"
    >
      <span class="tabular">
        {{ hoverCell ? `第 ${hoverCell.row + 1} 行 第 ${hoverCell.col + 1} 列` : '—' }}
      </span>
      <span v-if="hoverColor" class="tabular flex items-center gap-1.5">
        <span
          class="inline-block h-3 w-3 rounded-sm border border-black/20"
          :style="{ background: hoverColor.hex }"
        />
        {{ hoverColor.code }}
      </span>
      <span v-if="drafts.status" class="text-[var(--surface-text-muted)]">{{ drafts.status }}</span>
      <span v-if="pattern.report" class="tabular ml-auto">
        平均色差 ΔE {{ pattern.report.averageDeltaE }} · 生成耗时
        {{ pattern.durationMs }}ms
      </span>
    </footer>

    <CropDialog
      v-if="pendingCrop"
      :image="pendingCrop"
      @confirm="onCropConfirm"
      @skip="onCropSkip"
    />
  </div>
</template>
