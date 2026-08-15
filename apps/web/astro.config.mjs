// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/** 仓库根目录（.env / .env.example 所在处） */
const monorepoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * 读仓库根 .env。命令行 / CI 显式设置的同名变量优先于文件。
 * @param {string} root
 * @param {string} key
 * @param {string} [fallback]
 */
function pickEnv(root, key, fallback = '') {
  const fromProc = process.env[key];
  if (fromProc != null && fromProc !== '') return fromProc;

  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return fallback;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    if (k !== key) continue;
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val || fallback;
  }
  return fallback;
}

export default defineConfig({
  // 让 Astro / Vite 也从仓库根加载 PUBLIC_*（island、客户端代码）
  envDir: monorepoRoot,

  // canonical 与 sitemap 的绝对 URL 基准。绝不在别处硬编码域名。
  site: pickEnv(monorepoRoot, 'PUBLIC_SITE_URL', 'http://localhost:4321'),

  // 与 Nginx 子路径、本地开发共用同一前缀（见仓库根 .env 的 PUBLIC_BASE_PATH）。
  // 挂在域名根时构建前覆盖：PUBLIC_BASE_PATH=/ pnpm build
  base: pickEnv(monorepoRoot, 'PUBLIC_BASE_PATH', '/'),

  // 静态托管必开。产物是目录形式（/palette/mard/index.html），
  // 与 Nginx 的 try_files $uri $uri/ 对应。
  trailingSlash: 'always',

  output: 'static',

  // 中文是主语言，放在根路径；英文走 /en/ 前缀。
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    // appEntrypoint 让所有 Vue island 共享同一个 app 实例配置（这里用于装 Pinia）
    vue({ appEntrypoint: '/src/vue-app' }),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
    worker: {
      // 生成管线跑在 Worker 里，需要 ES 模块格式才能 import core
      format: 'es',
    },
  },
});
