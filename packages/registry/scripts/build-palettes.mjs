/**
 * 色卡数据构建脚本。
 *
 * 用法：pnpm refresh:palettes
 *
 * 做三件事：
 *   1. 从两个已实际核验的上游仓库拉取原始色卡（带重试与磁盘缓存）
 *   2. 逐色号做多源交叉比对，用 CIEDE2000 量化分歧，标注 confidence
 *   3. 产出 data/*.json 并入库（数据必须可复现、可追溯，不能只存在于某人本地）
 *
 * 核心原则：不追求消除不确定性，而是量化它。
 * 官方机读色卡不存在（Artkal 是唯一例外），继续寻找「更准的数据源」没有终点。
 * 一个愿意标注「这条我不确定」的数据源，可信度显著高于给出整齐 HEX 的网站。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE2000, hexToLab, hexToRgb } from './color-math.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '.cache');
const DATA_DIR = join(ROOT, 'data');

const HANSBUG = 'https://raw.githubusercontent.com/HansBug/pindou-color-data/main';
const BITBEAD = 'https://raw.githubusercontent.com/pomodiary/bitbead.app/main/data';

/**
 * 上游数据源登记。
 *
 * 已确认的重复数据源（多源投票前必须剔除，否则复制品会被误判为独立佐证）：
 *   - 黄豆豆291、小舞家291 与 MARD291 的色号/HEX/RGB 完全一致
 *   - 优肯 MARD 同款 221 与 artkal-m-221-official 规范化后完全重复
 * 上游仓库已主动合并了这几组，故此处不再单独列出。
 *
 * 注意 bitbead 的 mard 与 HansBug 的 mard 是**真正独立**的两个来源
 * （实测 221 个色号中有 77 个 HEX 不一致），必须都参与投票。
 */
const SOURCES = {
  'hansbug-alfonse': `${HANSBUG}/mard-221-alfonse-doudou/colors.json`,
  'hansbug-mard221': `${HANSBUG}/mard-221-github/colors.json`,
  'hansbug-mard291': `${HANSBUG}/mard-291-github/colors.json`,
  'hansbug-coco291': `${HANSBUG}/coco-291/colors.json`,
  'hansbug-artkal-c197': `${HANSBUG}/artkal-c-197-official/colors.json`,
  'hansbug-artkal-m221': `${HANSBUG}/artkal-m-221-official/colors.json`,
  'hansbug-manman278': `${HANSBUG}/manman-278/colors.json`,
  'hansbug-panpan289': `${HANSBUG}/panpan-289/colors.json`,
  'hansbug-mixiaowo290': `${HANSBUG}/mixiaowo-290/colors.json`,
  bitbead: `${BITBEAD}/palettes.json`,
};

/** 带重试与磁盘缓存的抓取。上游偶发连接失败，实测重试一次即可成功。 */
async function fetchCached(key, url, { retries = 5 } = {}) {
  const cacheFile = join(CACHE_DIR, `${key}.json`);
  if (existsSync(cacheFile)) {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  }
  await mkdir(CACHE_DIR, { recursive: true });

  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(cacheFile, JSON.stringify(json), 'utf8');
      console.log(`  ✓ ${key}`);
      return json;
    } catch (err) {
      lastErr = err;
      console.log(`  · ${key} 第 ${i} 次失败：${err.message}`);
      if (i < retries) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`拉取 ${key} 失败：${lastErr?.message}`);
}

/** HansBug 格式 → 归一化 { code, hex, group, unidentified } */
function normalizeHansBug(raw) {
  return raw.colors.map((c) => ({
    code: String(c.code),
    hex: String(c.hex).toUpperCase(),
    group: c.group ?? null,
    name: null,
    unidentified: Boolean(c.unidentified),
    originalCode: c.original_code ?? null,
  }));
}

/** bitbead 格式 → 归一化 */
function normalizeBitbead(raw, brandKey) {
  const list = raw.palettes[brandKey];
  if (!list) throw new Error(`bitbead 中不存在色板 ${brandKey}`);
  return list.map((c) => ({
    code: String(c.code),
    hex: String(c.hex).toUpperCase(),
    group: null,
    // bitbead 对 COCO/MARD 的 name 字段就是 code 本身，不算真实色名
    name: c.name && c.name !== c.code ? c.name : null,
    unidentified: false,
    originalCode: null,
  }));
}

/**
 * 多源合并。
 *
 * 只有当各源的色号集合高度重合时才做交叉比对——这是防止「色号字面映射」
 * 这类错误的护栏。实测 COCO 291 与 MARD 291 有 290/291 个 HEX 相同，
 * 却只有 48 个色号重叠且这 48 个在两边指向不同颜色；若不做重合度检查
 * 就盲目按 code 对齐，会产出完全错误的数据。
 */
function mergeSources(entries, { overlapThreshold = 0.9, medianDeltaEThreshold = 5 } = {}) {
  const [primary, ...others] = entries;
  const primaryCodes = new Set(primary.colors.map((c) => c.code));

  const usable = [];
  for (const other of others) {
    const otherCodes = new Set(other.colors.map((c) => c.code));
    let hit = 0;
    for (const code of primaryCodes) if (otherCodes.has(code)) hit++;
    const overlap = hit / primaryCodes.size;

    if (overlap < overlapThreshold) {
      console.log(
        `    ! 跳过 ${other.sourceId}：色号重合度仅 ${(overlap * 100).toFixed(1)}%，不足以按色号对齐`,
      );
      continue;
    }

    // 第二道检查：色号对得上不代表颜色对得上。
    // 实测 COCO 的两个上游色号重合度高达 92%，但 HEX 交集只有 3%——
    // 那是同一批颜色的两套互斥编号，按色号对齐会产出完全错误的数据。
    // 这正是「跨品牌色号不可字面映射」在数据构建期的体现，必须用颜色本身裁决。
    const deltas = [];
    for (const base of primary.colors) {
      const found = other.colors.find((c) => c.code === base.code);
      if (found) deltas.push(deltaE2000(hexToLab(base.hex), hexToLab(found.hex)));
    }
    deltas.sort((a, b) => a - b);
    const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : Infinity;

    if (median > medianDeltaEThreshold) {
      console.log(
        `    ! 拒绝合并 ${other.sourceId}：色号重合 ${(overlap * 100).toFixed(1)}% 但重合色号的中位 ΔE 达 ${median.toFixed(1)}，` +
          '判定为不同的编号体系，按色号对齐会产出错误数据',
      );
      continue;
    }

    usable.push(other);
  }

  const merged = [];
  for (const base of primary.colors) {
    const variants = [{ sourceId: primary.sourceId, hex: base.hex }];
    for (const other of usable) {
      const found = other.colors.find((c) => c.code === base.code);
      if (found) variants.push({ sourceId: other.sourceId, hex: found.hex });
    }

    // 两两比对，取最大 ΔE00 作为分歧度量
    let maxDeltaE = 0;
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const d = deltaE2000(
          hexToLab(variants[i].hex),
          hexToLab(variants[j].hex),
        );
        if (d > maxDeltaE) maxDeltaE = d;
      }
    }

    // 单一来源时无法交叉验证，可信度封顶为 medium，绝不标 high
    let confidence;
    if (variants.length === 1) {
      confidence = 'medium';
    } else if (maxDeltaE < 1) {
      confidence = 'high';
    } else if (maxDeltaE < 3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // 无法确认真实品牌色号的，一律降为 low 并保留标记
    if (base.unidentified) confidence = 'low';

    // 取名：优先用有真实色名的源
    let name = base.name;
    if (!name) {
      for (const other of usable) {
        const found = other.colors.find((c) => c.code === base.code);
        if (found?.name) {
          name = found.name;
          break;
        }
      }
    }

    merged.push({
      code: base.code,
      name: name ?? base.code,
      hex: base.hex,
      lab: hexToLab(base.hex).map((v) => Number(v.toFixed(4))),
      confidence,
      sources: variants.map((v) => v.sourceId),
      ...(base.unidentified ? { unidentified: true } : {}),
      ...(maxDeltaE > 0 ? { maxDeltaE: Number(maxDeltaE.toFixed(3)) } : {}),
      ...(base.group ? { group: base.group } : {}),
    });
  }

  return merged;
}

/**
 * 套装分档。
 *
 * 只登记「档位存在」这一可证实的事实，绝不猜测每档的具体色号构成——
 * 24/48/72/96/120/144 的累加规则来自义乌①至⑥号色盘，这是可证实的；
 * 但哪 24 个色号构成①号盘，无任何公开可靠数据。
 */
function buildSets(counts, note) {
  return counts.map((count) => ({
    count,
    codes: [],
    codesKnown: false,
    note,
  }));
}

const YIWU_NOTE =
  '档位来自义乌①至⑥号色盘的累加规则（24 色为①号盘，48 色为①+②，依此类推）。具体色号构成因商家而异，无公开可靠数据，请手动勾选或导入实际色号。';
const RETAIL_NOTE =
  '零售端常见档位。具体色号构成因商家而异，无公开可靠数据，请手动勾选或导入实际色号。';

const CC_BY_NOTICE =
  '部分色彩数据来自 Bitbead（https://www.bitbead.app），依 CC BY 4.0 使用。品牌名为各自商标，本项目与任何拼豆厂商无隶属或背书关系。';

async function main() {
  console.log('拉取上游色卡数据…');
  const raw = {};
  for (const [key, url] of Object.entries(SOURCES)) {
    raw[key] = await fetchCached(key, url);
  }

  await mkdir(DATA_DIR, { recursive: true });

  /** @type {Array<{file:string, build:() => object}>} */
  const targets = [
    {
      file: 'mard-221.json',
      build: () => {
        console.log('  合并 MARD 221（三源投票）');
        const colors = mergeSources([
          { sourceId: 'hansbug-alfonse', colors: normalizeHansBug(raw['hansbug-alfonse']) },
          { sourceId: 'hansbug-github', colors: normalizeHansBug(raw['hansbug-mard221']) },
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'mard') },
        ]);
        return {
          id: 'mard-221',
          brand: 'MARD',
          version: 'MARD 221 标准色卡',
          colors,
          sets: [
            ...buildSets([24, 48, 72, 96, 120, 144], YIWU_NOTE),
            ...buildSets([168, 192, 221], RETAIL_NOTE),
          ],
          attribution: {
            sources: [
              'HansBug/pindou-color-data (MIT)',
              'pomodiary/bitbead.app (CC BY 4.0)',
            ],
            license: 'MIT + CC BY 4.0',
            notice: CC_BY_NOTICE,
          },
        };
      },
    },
    {
      file: 'mard-291.json',
      build: () => {
        console.log('  合并 MARD 291（双源投票）');
        const colors = mergeSources([
          { sourceId: 'hansbug-github', colors: normalizeHansBug(raw['hansbug-mard291']) },
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'mard-291') },
        ]);
        return {
          id: 'mard-291',
          brand: 'MARD',
          version: 'MARD 291 扩展色卡',
          colors,
          sets: buildSets([221, 264, 291], RETAIL_NOTE),
          attribution: {
            sources: [
              'HansBug/pindou-color-data (MIT)',
              'pomodiary/bitbead.app (CC BY 4.0)',
            ],
            license: 'MIT + CC BY 4.0',
            notice: CC_BY_NOTICE,
          },
        };
      },
    },
    {
      file: 'coco-291.json',
      build: () => {
        console.log('  合并 COCO 291（双源投票）');
        const colors = mergeSources([
          { sourceId: 'hansbug', colors: normalizeHansBug(raw['hansbug-coco291']) },
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'coco') },
        ]);
        return {
          id: 'coco-291',
          brand: 'COCO',
          version: 'COCO 291 色卡',
          colors,
          sets: buildSets([144, 221, 291], RETAIL_NOTE),
          attribution: {
            sources: ['HansBug/pindou-color-data (MIT)'],
            license: 'MIT',
            notice:
              '市面存在两套互斥的 COCO 编号体系：本数据采用 HansBug 仓库口径；另一公开数据集的 COCO 与 MARD 291 共用同一批 HEX 但编号完全不同，两者色号重合度虽高达 92%，重合色号的实际颜色却对不上，已在构建期被自动拒绝合并。因此 COCO 色号跨数据源不可字面对照，务必以实体店色卡为准。',
          },
        };
      },
    },
    {
      file: 'artkal-c197.json',
      build: () => {
        console.log('  Artkal C197（官方，单源）');
        const colors = mergeSources([
          { sourceId: 'artkal-official', colors: normalizeHansBug(raw['hansbug-artkal-c197']) },
        ]);
        return {
          id: 'artkal-c197',
          brand: 'Artkal 优肯',
          version: 'Artkal C 系 197 色（官方）',
          colors,
          sets: buildSets([197], RETAIL_NOTE),
          attribution: {
            sources: ['Artkal 官方色卡与 RGB PDF', 'HansBug/pindou-color-data (MIT)'],
            license: 'MIT',
            notice:
              'Artkal 是目前唯一发布官方机读 RGB 数据的品牌。CG/CP/CT 特殊材质色号的 RGB 由官方色卡图采样补齐。',
          },
        };
      },
    },
    {
      file: 'artkal-m221.json',
      build: () => {
        console.log('  合并 Artkal M221（官方 + bitbead）');
        const colors = mergeSources([
          { sourceId: 'artkal-official', colors: normalizeHansBug(raw['hansbug-artkal-m221']) },
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'artkal-mini') },
        ]);
        return {
          id: 'artkal-m221',
          brand: 'Artkal 优肯',
          version: 'Artkal M 系 221 色（官方，MARD 兼容体系）',
          colors,
          sets: buildSets([221], RETAIL_NOTE),
          attribution: {
            sources: ['Artkal 官方 RGB PDF', 'pomodiary/bitbead.app (CC BY 4.0)'],
            license: 'MIT + CC BY 4.0',
            notice:
              'Artkal M 系是官方对 MARD 的兼容体系（MA1 对应 MARD A1），但它是 Artkal 官方口径，不是 MARD 原厂色卡。色号可对应不等于颜色相同，仅可作交叉校验参考。',
          },
        };
      },
    },
    {
      file: 'perler.json',
      build: () => {
        console.log('  Perler（bitbead 单源）');
        const colors = mergeSources([
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'perler') },
        ]);
        return {
          id: 'perler',
          brand: 'Perler',
          version: 'Perler 色卡',
          colors,
          sets: [],
          attribution: {
            sources: ['pomodiary/bitbead.app (CC BY 4.0)'],
            license: 'CC BY 4.0',
            notice: CC_BY_NOTICE,
          },
        };
      },
    },
    {
      file: 'hama.json',
      build: () => {
        console.log('  Hama（bitbead 单源）');
        const colors = mergeSources([
          { sourceId: 'bitbead', colors: normalizeBitbead(raw['bitbead'], 'hama') },
        ]);
        return {
          id: 'hama',
          brand: 'Hama',
          version: 'Hama 色卡',
          colors,
          sets: [],
          attribution: {
            sources: ['pomodiary/bitbead.app (CC BY 4.0)'],
            license: 'CC BY 4.0',
            notice: CC_BY_NOTICE,
          },
        };
      },
    },
    {
      file: 'manman-278.json',
      build: () => {
        console.log('  漫漫 278（单源）');
        const colors = mergeSources([
          { sourceId: 'hansbug', colors: normalizeHansBug(raw['hansbug-manman278']) },
        ]);
        return {
          id: 'manman-278',
          brand: '漫漫',
          version: '漫漫 278 色卡',
          colors,
          sets: [],
          attribution: {
            sources: ['HansBug/pindou-color-data (MIT)'],
            license: 'MIT',
            notice: '上游对 5 组重复色号做过交叉验证修正，保留原始 HEX。',
          },
        };
      },
    },
    {
      file: 'panpan-289.json',
      build: () => {
        console.log('  盼盼 289（单源，含 4 个无法确认色号）');
        const colors = mergeSources([
          { sourceId: 'hansbug', colors: normalizeHansBug(raw['hansbug-panpan289']) },
        ]);
        return {
          id: 'panpan-289',
          brand: '盼盼',
          version: '盼盼 289 色卡',
          colors,
          sets: [],
          attribution: {
            sources: ['HansBug/pindou-color-data (MIT)'],
            license: 'MIT',
            notice:
              '其中 4 个色号在上游即为「-」，无法确认真实品牌色号，已标记 unidentified，不做猜测填充。',
          },
        };
      },
    },
    {
      file: 'mixiaowo-290.json',
      build: () => {
        console.log('  咪小窝 290（单源，含 4 个无法确认色号）');
        const colors = mergeSources([
          { sourceId: 'hansbug', colors: normalizeHansBug(raw['hansbug-mixiaowo290']) },
        ]);
        return {
          id: 'mixiaowo-290',
          brand: '咪小窝',
          version: '咪小窝 290 色卡',
          colors,
          sets: [],
          attribution: {
            sources: ['HansBug/pindou-color-data (MIT)'],
            license: 'MIT',
            notice:
              '其中 4 个色号在上游即为「-」，无法确认真实品牌色号，已标记 unidentified，不做猜测填充。',
          },
        };
      },
    },
  ];

  console.log('\n生成色卡数据…');
  const summary = [];
  const index = [];
  for (const t of targets) {
    const palette = t.build();
    await writeFile(
      join(DATA_DIR, t.file),
      `${JSON.stringify(palette, null, 2)}\n`,
      'utf8',
    );
    const stat = { id: palette.id, count: palette.colors.length, high: 0, medium: 0, low: 0 };
    for (const c of palette.colors) stat[c.confidence]++;
    summary.push(stat);

    // 轻量索引：列表页与选择器只需元信息，不必加载完整色卡（全部色卡合计约 600KB）
    index.push({
      id: palette.id,
      brand: palette.brand,
      version: palette.version,
      count: palette.colors.length,
      confidence: { high: stat.high, medium: stat.medium, low: stat.low },
      unidentifiedCount: palette.colors.filter((c) => c.unidentified).length,
      sets: palette.sets.map((s) => s.count),
      license: palette.attribution.license,
    });
  }

  await writeFile(
    join(DATA_DIR, 'index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
    'utf8',
  );

  console.log('\n置信度分布：');
  console.table(summary);
  console.log('\n完成。数据已写入 packages/registry/data/');
  console.log('提示：删除 packages/registry/.cache/ 可强制重新拉取上游。');
}

main().catch((err) => {
  console.error('构建失败：', err);
  process.exit(1);
});
