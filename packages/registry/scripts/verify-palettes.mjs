/**
 * 色卡数据校验（CI 门禁）。
 *
 * 用法：pnpm verify:data
 *
 * 色卡数据是业务正确性的生死线：厂商无官方机读色卡，搜索结果被 AI 内容农场
 * 大面积污染，而图纸上的色号直接决定用户去店里买哪袋豆。数据错了，
 * 整个产品的输出都是错的，且用户要花真金白银和几十小时才会发现。
 *
 * 断言的设计原则：
 *   1. 优先用**可自洽求和的结构性约束**（各前缀分组求和必须精确等于总数），
 *      这比抽查几个色号强得多——它能捕获任何增删改。
 *   2. 色系类断言**不下探到精确 HEX**。两个公开源对 MARD H1/H2 谁是纯白的
 *      结论正好相反，若断言 H2 === '#FFFFFF' 就是把一个悬而未决的分歧
 *      当成了事实。
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToLab } from './color-math.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
}

const load = async (file) =>
  JSON.parse(await readFile(join(DATA_DIR, file), 'utf8'));

/** 按色号前缀分组统计（前导字母部分） */
function groupCounts(colors) {
  const out = {};
  for (const c of colors) {
    const m = /^([A-Za-z]+)/.exec(c.code);
    const key = m ? m[1].toUpperCase() : '#';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function maxNumericSuffix(colors, prefix) {
  let max = 0;
  for (const c of colors) {
    const m = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(c.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

async function main() {
  console.log('校验色卡数据…\n');

  // index.json 是构建期生成的轻量索引，不是色卡本体，单独校验
  const files = (await readdir(DATA_DIR)).filter(
    (f) => f.endsWith('.json') && f !== 'index.json',
  );
  check('data 目录非空', files.length > 0);

  // ---- 通用结构校验 ----
  console.log('\n[通用] 结构与数据自洽性');
  for (const file of files) {
    const p = await load(file);
    const codes = new Set();
    let badHex = null;
    let badLab = null;
    let dupCode = null;

    for (const c of p.colors) {
      // HEX 合法性：六位或八位（透明色必须保留 alpha，不可退化为六位）
      if (!/^#[0-9A-F]{6}([0-9A-F]{2})?$/.test(c.hex)) badHex ??= c;
      if (codes.has(c.code)) dupCode ??= c.code;
      codes.add(c.code);

      // lab 必须与 hex 自洽，防止数据被手工改过一处而另一处没跟着变
      const expect = hexToLab(c.hex);
      const drift = Math.max(
        ...expect.map((v, i) => Math.abs(v - c.lab[i])),
      );
      if (drift > 0.01) badLab ??= { code: c.code, expect, got: c.lab };
    }

    check(`${file} HEX 全部合法`, !badHex, badHex && `首个异常：${badHex.code} = ${badHex.hex}`);
    check(`${file} 色号唯一`, !dupCode, dupCode && `重复色号：${dupCode}`);
    check(
      `${file} lab 与 hex 自洽`,
      !badLab,
      badLab && `${badLab.code} 期望 ${badLab.expect} 实际 ${badLab.got}`,
    );
    check(
      `${file} 每条都有 confidence 与 sources`,
      p.colors.every((c) => c.confidence && Array.isArray(c.sources) && c.sources.length > 0),
    );
    check(
      `${file} 套装分档未猜测色号`,
      p.sets.every((s) => s.codesKnown === true || s.codes.length === 0),
      'codesKnown 为 false 时 codes 必须为空，不允许猜测填充',
    );
  }

  // ---- MARD 221：可自洽求和的分组结构 ----
  console.log('\n[MARD 221] 分组结构（首个可自洽求和的硬数据）');
  const m221 = await load('mard-221.json');
  const g221 = groupCounts(m221.colors);
  const EXPECT_221 = { A: 26, B: 32, C: 29, D: 26, E: 24, F: 25, G: 21, H: 23, M: 15 };

  check('总数为 221', m221.colors.length === 221, `实际 ${m221.colors.length}`);
  for (const [prefix, want] of Object.entries(EXPECT_221)) {
    check(`${prefix} 系 ${want} 色`, g221[prefix] === want, `实际 ${g221[prefix] ?? 0}`);
  }
  const sum221 = Object.values(EXPECT_221).reduce((a, b) => a + b, 0);
  check('各前缀求和精确等于 221', sum221 === 221, `实际 ${sum221}`);
  check(
    '不存在预期之外的前缀',
    Object.keys(g221).every((k) => k in EXPECT_221),
    `多出：${Object.keys(g221).filter((k) => !(k in EXPECT_221)).join(', ')}`,
  );

  // A 系止于 A26 —— 已实证有商家自编号排到 A32，这条断言用于挡住污染数据
  check('A 系止于 A26', maxNumericSuffix(m221.colors, 'A') === 26,
    `实际最大 A${maxNumericSuffix(m221.colors, 'A')}`);

  // ---- MARD 291 = 221 + 70 扩展，且 221 为严格子集 ----
  console.log('\n[MARD 291] 扩展结构与子集关系（两个独立数据源已证实）');
  const m291 = await load('mard-291.json');
  const g291 = groupCounts(m291.colors);
  const EXPECT_EXT = { P: 23, R: 28, T: 1, Y: 5, ZG: 8, Q: 5 };

  check('总数为 291', m291.colors.length === 291, `实际 ${m291.colors.length}`);
  for (const [prefix, want] of Object.entries(EXPECT_EXT)) {
    check(`扩展 ${prefix} 系 ${want} 色`, g291[prefix] === want, `实际 ${g291[prefix] ?? 0}`);
  }
  const extSum = Object.values(EXPECT_EXT).reduce((a, b) => a + b, 0);
  check('扩展部分求和等于 70', extSum === 70, `实际 ${extSum}`);
  check('221 + 70 = 291', 221 + extSum === 291);

  const codes291 = new Set(m291.colors.map((c) => c.code));
  const missing = m221.colors.filter((c) => !codes291.has(c.code)).map((c) => c.code);
  check('221 的全部色号都出现在 291 中', missing.length === 0,
    missing.length ? `缺失：${missing.slice(0, 5).join(', ')}…` : '');

  // ---- 白/黑色系断言：只到色系粒度 ----
  console.log('\n[MARD] 零售端实证锚点（仅断言到色系，不断言精确 HEX）');
  const byCode = new Map(m221.colors.map((c) => [c.code, c]));
  const h2 = byCode.get('H2');
  const h7 = byCode.get('H7');

  check('存在 H2', Boolean(h2));
  check('存在 H7', Boolean(h7));
  if (h2) {
    // 商家 SKU 明写「白豆H2」。但纯白究竟是 H1 还是 H2，两个公开源结论相反，
    // 故只断言「属于白色系」（L* 很高且近乎无彩），不断言等于 #FFFFFF。
    const [L, a, b] = h2.lab;
    check('H2 属白色系（L* > 90 且近乎无彩）',
      L > 90 && Math.hypot(a, b) < 12, `实际 L*=${L.toFixed(1)} C*=${Math.hypot(a, b).toFixed(1)}`);
  }
  if (h7) {
    const [L, a, b] = h7.lab;
    check('H7 属黑色系（L* < 30 且近乎无彩）',
      L < 30 && Math.hypot(a, b) < 12, `实际 L*=${L.toFixed(1)} C*=${Math.hypot(a, b).toFixed(1)}`);
  }

  // ---- 许可与署名 ----
  console.log('\n[合规] 许可与署名');
  for (const file of files) {
    const p = await load(file);
    check(`${file} 标注了许可与来源`,
      Boolean(p.attribution?.license) && (p.attribution?.sources?.length ?? 0) > 0);
  }
  const needsCcBy = ['perler.json', 'hama.json'];
  for (const file of needsCcBy) {
    const p = await load(file);
    check(`${file} 含 CC BY 4.0 署名`, /CC BY 4\.0/.test(p.attribution.license));
  }

  // ---- 索引与色卡本体一致 ----
  console.log('\n[索引] index.json 与色卡本体一致');
  const index = await load('index.json');
  check('索引条目数与色卡文件数一致', index.length === files.length,
    `索引 ${index.length} 项，色卡 ${files.length} 个`);
  for (const entry of index) {
    const p = await load(`${entry.id}.json`);
    check(`${entry.id} 索引色数与本体一致`, entry.count === p.colors.length,
      `索引 ${entry.count}，本体 ${p.colors.length}`);
  }

  console.log(`\n共 ${checks} 项检查，失败 ${failures} 项。`);
  if (failures > 0) {
    console.error('\n色卡数据校验未通过。数据错误会直接导致用户买错豆，必须修复后再提交。');
    process.exit(1);
  }
  console.log('色卡数据校验通过。');
}

main().catch((err) => {
  console.error('校验脚本异常：', err);
  process.exit(1);
});
