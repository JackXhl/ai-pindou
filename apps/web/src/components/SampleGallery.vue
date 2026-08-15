<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import SamplePatternCard from './SamplePatternCard.vue';
import {
  SAMPLE_TAGS,
  filterSamplesByTag,
  listSamples,
  paginateSamples,
  takeSampleBatch,
  type SampleMeta,
  type SampleTag,
} from '../lib/samples.js';

const VIEW_STORAGE_KEY = 'aipindou:patterns-view';
const WATERFALL_BATCH = 12;
const PAGE_SIZE = 24;

type ViewMode = 'waterfall' | 'page';

const all = ref<SampleMeta[]>([]);
const loading = ref(true);
const error = ref('');
const activeTag = ref<SampleTag | '全部'>('全部');
const viewMode = ref<ViewMode>('waterfall');
const offset = ref(0);
const page = ref(1);

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const tagOptions = ['全部', ...SAMPLE_TAGS] as const;

const filtered = computed(() => filterSamplesByTag(all.value, activeTag.value));

const visible = computed(() => {
  if (viewMode.value === 'page') {
    return paginateSamples(filtered.value, page.value, PAGE_SIZE).pageItems;
  }
  return takeSampleBatch(filtered.value, 0, offset.value);
});

const pageInfo = computed(() => paginateSamples(filtered.value, page.value, PAGE_SIZE));

const hasMore = computed(
  () => viewMode.value === 'waterfall' && offset.value < filtered.value.length,
);

const isEmpty = computed(() => !loading.value && !error.value && filtered.value.length === 0);

function readViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw === 'waterfall' || raw === 'page') return raw;
  } catch {
    /* ignore */
  }
  return 'waterfall';
}

function persistViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function resetWaterfallOffset() {
  offset.value = Math.min(WATERFALL_BATCH, filtered.value.length);
}

function resetPage() {
  page.value = 1;
}

function appendWaterfallBatch() {
  if (!hasMore.value) return;
  offset.value = Math.min(offset.value + WATERFALL_BATCH, filtered.value.length);
}

function sentinelStillVisible(): boolean {
  const el = sentinelRef.value;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.top <= window.innerHeight + 200;
}

async function onSentinelIntersect() {
  if (viewMode.value !== 'waterfall' || !hasMore.value) return;
  appendWaterfallBatch();
  await nextTick();
  if (hasMore.value && sentinelStillVisible()) {
    await onSentinelIntersect();
  }
}

function disconnectObserver() {
  observer?.disconnect();
  observer = null;
}

function setupObserver() {
  disconnectObserver();
  if (viewMode.value !== 'waterfall' || !hasMore.value) return;

  const el = sentinelRef.value;
  if (!el) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void onSentinelIntersect();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(el);
}

watch(viewMode, (mode) => {
  persistViewMode(mode);
  if (mode === 'waterfall') {
    resetWaterfallOffset();
    void nextTick(() => setupObserver());
  } else {
    disconnectObserver();
    resetPage();
  }
});

watch(activeTag, () => {
  if (viewMode.value === 'waterfall') {
    resetWaterfallOffset();
    void nextTick(() => setupObserver());
  } else {
    resetPage();
  }
});

watch(hasMore, () => {
  if (viewMode.value === 'waterfall') {
    void nextTick(() => setupObserver());
  }
});

function setViewMode(mode: ViewMode) {
  viewMode.value = mode;
}

function prevPage() {
  if (page.value > 1) page.value -= 1;
}

function nextPage() {
  if (page.value < pageInfo.value.totalPages) page.value += 1;
}

onMounted(async () => {
  viewMode.value = readViewMode();

  try {
    all.value = await listSamples();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
    if (viewMode.value === 'waterfall') {
      resetWaterfallOffset();
      await nextTick();
      setupObserver();
    }
  }
});

onUnmounted(() => {
  disconnectObserver();
});
</script>

<template>
  <div>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap gap-2" role="tablist" aria-label="分类筛选">
        <button
          v-for="tag in tagOptions"
          :key="tag"
          type="button"
          role="tab"
          :aria-selected="activeTag === tag"
          class="rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm"
          :class="
            activeTag === tag
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-text-muted)] hover:border-brand-300'
          "
          @click="activeTag = tag"
        >
          {{ tag }}
        </button>
      </div>

      <div
        class="inline-flex shrink-0 self-start rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-panel)] p-0.5"
        role="group"
        aria-label="浏览方式"
      >
        <button
          type="button"
          class="rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium transition sm:text-sm"
          :class="
            viewMode === 'waterfall'
              ? 'bg-brand-500 text-white'
              : 'text-[var(--surface-text-muted)] hover:text-[var(--surface-text)]'
          "
          @click="setViewMode('waterfall')"
        >
          瀑布流
        </button>
        <button
          type="button"
          class="rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium transition sm:text-sm"
          :class="
            viewMode === 'page'
              ? 'bg-brand-500 text-white'
              : 'text-[var(--surface-text-muted)] hover:text-[var(--surface-text)]'
          "
          @click="setViewMode('page')"
        >
          分页
        </button>
      </div>
    </div>

    <div v-if="loading" class="mt-8 text-sm text-[var(--surface-text-muted)]">加载中…</div>
    <p v-else-if="error" class="mt-8 text-sm text-[var(--color-danger)]">{{ error }}</p>
    <p v-else-if="isEmpty" class="mt-8 text-sm text-[var(--surface-text-muted)]">
      该分类暂无图纸
    </p>

    <template v-else>
      <ul class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <SamplePatternCard v-for="s in visible" :key="s.id" v-bind="s" />
      </ul>

      <div
        v-if="viewMode === 'waterfall' && hasMore"
        ref="sentinelRef"
        class="mt-6 h-8"
        aria-hidden="true"
      />

      <nav
        v-if="viewMode === 'page' && pageInfo.totalPages > 1"
        class="mt-8 flex items-center justify-center gap-4"
        aria-label="分页导航"
      >
        <button
          type="button"
          class="min-h-10 rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--surface-text)] transition disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="page <= 1"
          @click="prevPage"
        >
          上一页
        </button>
        <span class="text-sm tabular-nums text-[var(--surface-text-muted)]">
          第 {{ page }} / {{ pageInfo.totalPages }} 页
        </span>
        <button
          type="button"
          class="min-h-10 rounded-[var(--radius-control)] border border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--surface-text)] transition disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="page >= pageInfo.totalPages"
          @click="nextPage"
        >
          下一页
        </button>
      </nav>
    </template>
  </div>
</template>
