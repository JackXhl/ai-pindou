# 图纸库样例画廊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级样例卡片视觉，在 `/patterns/` 提供分类筛选 + 默认瀑布流无限滚动（可切分页），并扩充至约 48 个原创静态样例。

**Architecture:** 样例仍为 `public/samples/*.json` 静态资产；列表元数据在 `index.json`。新增 `SampleGallery.vue` 负责筛选与双模式加载；`SamplePatternCard.vue` 负责大图预览。生成侧把画家函数抽到 `scripts/sample-painters.ts`，由 `generate-samples.ts` 统一跑 `generate()` 入库。纯函数筛选逻辑放进 `samples.ts` 便于单测。

**Tech Stack:** Astro 7、Vue 3、Tailwind 4、既有 `@aipindou/core` generate、Vitest（web 层仅测纯函数）。

**Spec:** `deploy/specs/2026-08-15-sample-gallery-design.md`

---

## File map

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/lib/samples.ts` | 类型、list/load、筛选、预览绘制 |
| `apps/web/src/lib/samples-filter.test.ts` | 筛选/分页纯函数单测 |
| `apps/web/src/components/SamplePatternCard.vue` | 大图卡片 UI |
| `apps/web/src/components/SampleGallery.vue` | 图纸库：chip、瀑布流/分页、加载更多 |
| `apps/web/src/components/SamplePatternGrid.vue` | 首页精选：委托/保持 featured 横滑 |
| `apps/web/src/pages/patterns/index.astro` | 挂载 Gallery |
| `scripts/sample-painters.ts` | 全部像素画家 + catalog 定义 |
| `scripts/generate-samples.ts` | 读 catalog、调用 generate、写 JSON |
| `apps/web/public/samples/*` | 生成产物（提交入库） |

---

### Task 1: 样例筛选纯函数 + 单测

**Files:**
- Modify: `apps/web/src/lib/samples.ts`
- Create: `apps/web/src/lib/samples-filter.test.ts`
- Modify: `apps/web/package.json`（若尚无 test 脚本指向 vitest；优先在 `packages` 外用根目录 vitest，或给 web 加最小 vitest 配置）

为减少脚手架成本：**把纯函数放在 `packages/core` 不合适**（与 UI 域耦合）。改为在仓库根用已有 vitest，测试文件放 `apps/web/src/lib/samples-filter.test.ts`，并在根 `package.json` 的 test 中已有 `pnpm -r test`——给 `@aipindou/web` 增加 vitest 脚本与最小 config。

- [ ] **Step 1: 在 `samples.ts` 追加类型与纯函数**

在 `SampleMeta` 旁增加（`tag` 仍是唯一分类字段）：

```ts
export const SAMPLE_TAGS = [
  '入门',
  '可爱',
  '风景',
  '静物',
  '人像感',
  '节日',
  '几何',
] as const;
export type SampleTag = (typeof SAMPLE_TAGS)[number];

export function filterSamplesByTag(
  items: SampleMeta[],
  tag: SampleTag | '全部',
): SampleMeta[] {
  if (tag === '全部') return items.slice();
  return items.filter((s) => s.tag === tag);
}

export function paginateSamples(
  items: SampleMeta[],
  page: number,
  pageSize: number,
): { pageItems: SampleMeta[]; totalPages: number } {
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * size;
  return { pageItems: items.slice(start, start + size), totalPages };
}

export function takeSampleBatch(
  items: SampleMeta[],
  offset: number,
  batchSize: number,
): SampleMeta[] {
  return items.slice(offset, offset + Math.max(1, batchSize));
}
```

同步提高预览分辨率：将 `drawSamplePreview` 调用方 canvas 默认改为更大（卡片侧改）；函数本身若 `canvas.width` 已设则不变。可选：当 `cell >= 2` 时在格间画 1px 浅分隔（YAGNI：第一期可不加分隔，只保证填满）。

- [ ] **Step 2: 写失败单测**

创建 `apps/web/src/lib/samples-filter.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  filterSamplesByTag,
  paginateSamples,
  takeSampleBatch,
  type SampleMeta,
} from './samples.js';

const fixtures: SampleMeta[] = [
  { id: 'a', title: 'A', tag: '入门', featured: true, cols: 29, rows: 29, totalBeads: 1, totalColors: 1 },
  { id: 'b', title: 'B', tag: '可爱', featured: false, cols: 29, rows: 29, totalBeads: 1, totalColors: 2 },
  { id: 'c', title: 'C', tag: '入门', featured: false, cols: 29, rows: 29, totalBeads: 1, totalColors: 1 },
];

describe('filterSamplesByTag', () => {
  it('returns all for 全部', () => {
    expect(filterSamplesByTag(fixtures, '全部')).toHaveLength(3);
  });
  it('filters by tag', () => {
    expect(filterSamplesByTag(fixtures, '入门').map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('paginateSamples', () => {
  it('pages with size 2', () => {
    const { pageItems, totalPages } = paginateSamples(fixtures, 2, 2);
    expect(totalPages).toBe(2);
    expect(pageItems.map((s) => s.id)).toEqual(['c']);
  });
});

describe('takeSampleBatch', () => {
  it('slices batch', () => {
    expect(takeSampleBatch(fixtures, 1, 2).map((s) => s.id)).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 3: 为 web 包接上 vitest**

`apps/web/package.json` scripts：

```json
"test": "vitest run"
```

`apps/web/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

根 workspace 已有 vitest，web 包需声明 `"vitest": "workspace:*"` 或与根同版本的 devDependency（与 `packages/core` 对齐）。

- [ ] **Step 4: 跑测确认失败（函数尚未导出时）或先实现再跑通**

若 Step 1 已写入，直接：

```bash
pnpm --filter @aipindou/web test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/samples.ts apps/web/src/lib/samples-filter.test.ts apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml
git commit -m "feat: add sample list filter helpers and tests"
```

---

### Task 2: 升级 SamplePatternCard 大图视觉

**Files:**
- Modify: `apps/web/src/components/SamplePatternCard.vue`

- [ ] **Step 1: 重写卡片模板与预览尺寸**

要点（保持 `mode: link | inline`、`compact` 用于首页）：

- 非 compact：预览区 `aspect-square`，canvas 设为 `width=360 height=360`（或 320），`object-contain` 式由 `drawSamplePreview` 居中。
- 标题行 + 右侧色数 pill（`{{ totalColors }}`）。
- 副行：`{{ cols }}×{{ rows }} · {{ totalBeads }} 颗 · {{ tag }}`
- CTA 文案改为「同款」（保留箭头可选）。
- 容器：`rounded-2xl`、轻边框、`transition hover:-translate-y-0.5 hover:shadow-md`（`md:` 以上）。
- compact：较小正方形（如 `aspect-square` + canvas 160），供首页横滑。

`onMounted` 中在设 canvas 宽高后调用 `drawSamplePreview`。

- [ ] **Step 2: 本地目测**

```bash
pnpm dev
```

打开首页精选与 `/patterns/`，确认预览不拉伸变形、移动端整卡可点。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SamplePatternCard.vue
git commit -m "feat: enlarge sample card preview layout"
```

---

### Task 3: SampleGallery（筛选 + 瀑布流/分页）

**Files:**
- Create: `apps/web/src/components/SampleGallery.vue`
- Modify: `apps/web/src/pages/patterns/index.astro`
- Modify: `apps/web/src/components/SamplePatternGrid.vue`（首页保持 featured 横滑；可继续独立存在）

- [ ] **Step 1: 实现 `SampleGallery.vue`**

行为规格：

- `onMounted`：`listSamples()` → `all`。
- `activeTag`: `'全部' | SampleTag`，chip 列表来自 `SAMPLE_TAGS`。
- `viewMode`: `'waterfall' | 'page'`；默认 `waterfall`；读写  
  `localStorage` 键：`aipindou:patterns-view`（值 `waterfall`|`page`）。
- 派生 `filtered = filterSamplesByTag(all, activeTag)`。
- **瀑布流：** `visible` 初始 `takeSampleBatch(filtered, 0, 12)`；底部 sentinel + `IntersectionObserver` 每次再追加 12，直到耗尽；切换 tag 时重置 offset。
- **分页：** `page` 从 1；`paginateSamples(filtered, page, 24)`；底部分页按钮「上一页 / 下一页」与页码。
- 加载中 / 错误 / 空状态文案。
- 布局：`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4`（瀑布流与分页共用栅格；「瀑布流」此处指无限滚动加载，第一期不做真不等高）。

骨架示例：

```vue
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
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

const VIEW_KEY = 'aipindou:patterns-view';
const BATCH = 12;
const PAGE_SIZE = 24;

const all = ref<SampleMeta[]>([]);
const loading = ref(true);
const error = ref('');
const activeTag = ref<'全部' | SampleTag>('全部');
const viewMode = ref<'waterfall' | 'page'>('waterfall');
const offset = ref(0);
const page = ref(1);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const filtered = computed(() => filterSamplesByTag(all.value, activeTag.value));

const visible = computed(() => {
  if (viewMode.value === 'page') {
    return paginateSamples(filtered.value, page.value, PAGE_SIZE).pageItems;
  }
  return takeSampleBatch(filtered.value, 0, offset.value);
});

const totalPages = computed(
  () => paginateSamples(filtered.value, page.value, PAGE_SIZE).totalPages,
);

onMounted(async () => {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === 'page' || saved === 'waterfall') viewMode.value = saved;
  try {
    all.value = await listSamples();
    offset.value = Math.min(BATCH, all.value.length);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    if (viewMode.value !== 'waterfall') return;
    if (offset.value >= filtered.value.length) return;
    offset.value = Math.min(offset.value + BATCH, filtered.value.length);
  });
  if (sentinel.value) observer.observe(sentinel.value);
});

watch(sentinel, (el, _, onCleanup) => {
  if (!observer) return;
  if (el) observer.observe(el);
  onCleanup(() => {
    if (el) observer?.unobserve(el);
  });
});

watch(activeTag, () => {
  page.value = 1;
  offset.value = Math.min(BATCH, filtered.value.length);
});

watch(viewMode, (m) => {
  localStorage.setItem(VIEW_KEY, m);
  page.value = 1;
  offset.value = Math.min(BATCH, filtered.value.length);
});

onBeforeUnmount(() => observer?.disconnect());
</script>
```

模板含：chip 行、瀑布流/分页切换、grid 渲染 `SamplePatternCard`、`ref="sentinel"` 的底部哨兵、分页控件。

- [ ] **Step 2: `patterns/index.astro` 改用 Gallery**

```astro
import SampleGallery from '../../components/SampleGallery.vue';
...
<SampleGallery client:load />
```

更新页头文案：去掉「社区投稿筹备中」可保留一句；强调分类浏览。

- [ ] **Step 3: 手动验证**

```bash
pnpm dev
```

访问 `/aipindou/patterns/`（若 base 为 `/aipindou`）：切换分类、滚到底加载、切分页、刷新后模式记忆。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SampleGallery.vue apps/web/src/pages/patterns/index.astro
git commit -m "feat: patterns gallery with filters and infinite scroll"
```

---

### Task 4: 拆分 sample-painters + 统一 tag 分类

**Files:**
- Create: `scripts/sample-painters.ts`
- Modify: `scripts/generate-samples.ts`

- [ ] **Step 1: 抽出 `Rgb` 与现有 8 个画家**

`scripts/sample-painters.ts` 导出：

```ts
export type Rgba = [number, number, number, number];
export type SamplePainter = () => { width: number; height: number; data: Uint8ClampedArray };

export type SampleCatalogItem = {
  id: string;
  title: string;
  tag: '入门' | '可爱' | '风景' | '静物' | '人像感' | '节日' | '几何';
  featured: boolean;
  image: SamplePainter;
  opts: {
    cols: number;
    rows: number;
    simplify?: number;
    maxColors?: number;
    dither?: boolean;
  };
};

export function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
): { width: number; height: number; data: Uint8ClampedArray } {
  // 从 generate-samples.ts 原样搬迁
}
```

搬迁现有 heart/smiley/…/rainbow；**修正 tag**：`cat-58` → `可爱`，`rainbow-58` → `几何`（替换旧「进阶」「渐变」以匹配 chip）。

- [ ] **Step 2: `generate-samples.ts` 只负责 IO**

```ts
import { catalog } from './sample-painters.ts';
import { generate } from '../packages/core/src/generate.ts';
// loadPalette + loop write files（逻辑保持）
```

导出 `catalog` 为完整列表（本 Task 可仍只有 8 项，下 Task 扩满）。

- [ ] **Step 3: 再生并确认**

```bash
pnpm generate:samples
```

Expected: 至少 8 个 `✓`，`index.json` 中 tag 无「进阶」「渐变」。

- [ ] **Step 4: Commit**

```bash
git add scripts/sample-painters.ts scripts/generate-samples.ts apps/web/public/samples
git commit -m "refactor: extract sample painters and normalize tags"
```

---

### Task 5: 扩充至约 48 个原创画家

**Files:**
- Modify: `scripts/sample-painters.ts`
- Regenerate: `apps/web/public/samples/*`

- [ ] **Step 1: 按表追加 catalog（保留原 8 个 id）**

目标合计 **48**。下列为须实现的新增项（id 固定，便于稳定链接）；每项实现对应 `*Image` 画家，禁止可识别商业 IP。

**入门（补到 8，现有 heart/smiley/star 已占 3 → 再加 5）**
- `moon-29` 月牙 · 入门 · featured 可选
- `cloud-29` 云朵 · 入门
- `arrow-29` 箭头 · 入门
- `check-29` 对勾 · 入门
- `diamond-29` 菱形宝石 · 入门

**可爱（现有 mushroom/cherry/clover/cat = 4 → 再加 6 到 10）**
- `fish-29` 小鱼 · 可爱
- `bird-29` 小鸟 · 可爱
- `bunny-29` 圆耳兔剪影 · 可爱 · featured
- `cupcake-29` 杯子蛋糕 · 可爱
- `apple-29` 苹果 · 可爱
- `paw-29` 爪印 · 可爱

**风景（8）**
- `sunrise-29` 日出 · 风景 · featured
- `hills-29` 山丘 · 风景
- `waves-29` 海浪 · 风景
- `night-sky-29` 星空 · 风景 · featured
- `tree-line-29` 树影剪影 · 风景
- `island-29` 小岛 · 风景
- `rain-29` 雨丝窗 · 风景
- `aurora-52` 极光带 · 风景 · `52×29` 或 `58×29`

**静物（6）**
- `vase-29` 花瓶 · 静物
- `mug-29` 杯子 · 静物
- `book-29` 书本 · 静物
- `plant-29` 盆栽 · 静物 · featured
- `lamp-29` 台灯 · 静物
- `bottle-29` 瓶子 · 静物

**人像感（6）** — 抽象几何脸，非真人
- `face-round-29` 圆脸剪影 · 人像感 · featured
- `face-side-29` 侧脸剪影 · 人像感
- `bust-simple-29` 半身色块 · 人像感
- `hat-figure-29` 戴帽剪影 · 人像感
- `duo-faces-29` 双人剪影 · 人像感
- `mask-geo-29` 几何面具 · 人像感

**节日（6）**
- `lantern-29` 灯笼 · 节日 · featured
- `snowflake-29` 雪花 · 节日
- `gift-29` 礼物盒 · 节日
- `firework-29` 烟花点 · 节日
- `envelope-29` 红包/信封（无品牌字） · 节日
- `candle-29` 蜡烛 · 节日

**几何（现有 rainbow = 1 → 再加 3 到 4）**
- `mosaic-29` 马赛克窗 · 几何
- `pop-blocks-29` 色块构成 · 几何
- `spiral-29` 螺旋 · 几何

画家实现模式（示例，须完整写入文件）：

```ts
export function bunnyImage(size: number) {
  return makeImage(size, size, (x, y) => {
    const cx = size / 2;
    const cy = size * 0.58;
    const head = Math.hypot(x - cx, y - cy) < size * 0.28;
    const earL = Math.hypot(x - cx * 0.7, y - cy * 0.45) < size * 0.12 && y < cy;
    const earR = Math.hypot(x - cx * 1.3, y - cy * 0.45) < size * 0.12 && y < cy;
    if (earL || earR) return [250, 240, 245, 255];
    if (head) {
      if (Math.hypot(x - cx * 0.85, y - cy * 0.95) < size * 0.04) return [40, 40, 40, 255];
      if (Math.hypot(x - cx * 1.15, y - cy * 0.95) < size * 0.04) return [40, 40, 40, 255];
      return [250, 240, 245, 255];
    }
    return [245, 250, 255, 255];
  });
}
```

每个新增项在 `catalog` 数组注册，默认 opts：`cols:29, rows:29, simplify:22–35, maxColors:8–16`；`aurora`/`cat` 类用更大画布。

featured 合计控制在 **8～12**（含原有 featured，去掉过多的则把部分旧 featured 改为 false，保证首页不滥）。

- [ ] **Step 2: 生成**

```bash
pnpm generate:samples
```

Expected: `已写入 48 个样例`（若计数 46–50 可接受，计划以 48 为目标；不足则补画家）。

校验：

```bash
node -e "const i=require('./apps/web/public/samples/index.json'); console.log(i.length); console.log([...new Set(i.map(x=>x.tag))]);"
```

Expected: length ≈ 48；tags 仅为七类中的子集。

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-painters.ts apps/web/public/samples
git commit -m "feat: expand original sample catalog to ~48"
```

---

### Task 6: 首页精选与验收

**Files:**
- Modify: `apps/web/src/pages/index.astro`（若需要把 `limit={4}` 调到 6–8）
- Modify: `apps/web/src/components/SamplePatternGrid.vue`（确认仍 `featuredOnly` 横滑）

- [ ] **Step 1: 首页 `limit={6}` 或保持 4；确保 featured ≥ limit**

- [ ] **Step 2: 跑门禁**

```bash
pnpm --filter @aipindou/web test
pnpm --filter @aipindou/web build
```

Expected: test PASS；build Complete。

- [ ] **Step 3: 手工验收对照 spec 清单**

- `/patterns/` 瀑布流加载、分页、chip、localStorage  
- 卡片大图、「同款」进编辑器  
- 无未授权 IP 题材  

- [ ] **Step 4: Commit（若有首页微调）**

```bash
git add apps/web/src/pages/index.astro
git commit -m "chore: tune home featured sample count"
```

---

## Spec coverage check

| Spec 项 | Task |
| --- | --- |
| 大图卡片视觉 | Task 2 |
| 分类 chip | Task 3 |
| 瀑布流 + 分页 + localStorage | Task 3 |
| G1 图纸库 / 首页精选 | Task 3 + 6 |
| ~48 原创样例 + tag 体系 | Task 4–5 |
| generate 管线 | Task 4–5 |
| 筛选可测 | Task 1 |
| 不碰 IP / 不爬站 | Task 5 约束 |

## Placeholder scan

无 TBD；画家清单 id 已固定；真不等高瀑布流明确不在本期。
