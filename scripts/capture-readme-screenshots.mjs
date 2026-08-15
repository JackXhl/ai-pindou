/**
 * 从线上站点截取 README 展示图。用法：node scripts/capture-readme-screenshots.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.argv[2] ?? 'https://ai-pindou.aipindou.workers.dev').replace(/\/$/, '');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets');

async function waitForCanvas(page) {
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas || canvas.width < 8) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 30) return true;
    }
    return false;
  }, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function waitForSamples(page) {
  await page.waitForFunction(
    () => !document.body.textContent?.includes('加载样例'),
    { timeout: 30_000 },
  );
  await page.waitForSelector('a[href*="sample="]', { timeout: 30_000 });
  await page.waitForTimeout(500);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const shots = [
  { file: 'screenshot-home.png', url: '/', wait: (page) => page.waitForTimeout(800) },
  {
    file: 'screenshot-editor.png',
    url: '/editor/?sample=mushroom-29',
    wait: async (page) => {
      await page.waitForSelector('text=像素小蘑菇', { timeout: 30_000 });
      await waitForCanvas(page);
    },
  },
  {
    file: 'screenshot-palette.png',
    url: '/palette/mard-221/',
    wait: (page) => page.waitForSelector('text=全部色号', { timeout: 30_000 }),
  },
  {
    file: 'screenshot-patterns.png',
    url: '/patterns/',
    wait: waitForSamples,
    fullPage: true,
  },
];

for (const shot of shots) {
  await page.goto(`${baseUrl}${shot.url}`, { waitUntil: 'networkidle' });
  await shot.wait(page);
  await page.screenshot({
    path: path.join(outDir, shot.file),
    fullPage: shot.fullPage ?? false,
  });
  console.log('saved', shot.file);
}

await browser.close();
