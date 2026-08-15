<script setup lang="ts">
import { onMounted, ref } from 'vue';
import SamplePatternCard from './SamplePatternCard.vue';
import { listSamples, type SampleMeta } from '../lib/samples.js';

const props = withDefaults(
  defineProps<{
    /** 只展示精选 */
    featuredOnly?: boolean;
    /** 最多展示几条（0 = 全部） */
    limit?: number;
    compact?: boolean;
    mode?: 'link' | 'inline';
  }>(),
  { featuredOnly: false, limit: 0, compact: false, mode: 'link' },
);

const emit = defineEmits<{
  select: [id: string];
}>();

const items = ref<SampleMeta[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    let list = await listSamples();
    if (props.featuredOnly) list = list.filter((s) => s.featured);
    if (props.limit > 0) list = list.slice(0, props.limit);
    items.value = list;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="loading" class="text-sm text-[var(--surface-text-muted)]">加载样例…</div>
  <p v-else-if="error" class="text-sm text-[var(--color-danger)]">{{ error }}</p>
  <!-- 移动端横滑卡片（H5 常见），桌面栅格 -->
  <ul
    v-else
    class="m-0 list-none gap-3 p-0"
    :class="
      compact
        ? 'grid grid-cols-2 sm:grid-cols-4'
        : 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden'"
  >
    <SamplePatternCard
      v-for="s in items"
      :key="s.id"
      v-bind="s"
      :compact="compact"
      :mode="mode"
      :class="compact ? undefined : 'w-[72%] shrink-0 snap-start sm:w-[46%] md:w-auto'"
      @select="emit('select', $event)"
    />
  </ul>
</template>
