const CACHE = 'aipindou-shell-v2';
// 相对 SW 自身位置解析，兼容 / 与 /aipindou/ 子路径部署
const BASE = new URL('./', self.location.href).pathname;
const PRECACHE = [
  BASE,
  `${BASE}editor/`,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.svg`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 只缓存站点壳与静态资源，不碰用户内容（本来也没有上传接口）
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          const underAstro = url.pathname.includes('/_astro/');
          const staticAsset =
            url.pathname.endsWith('.svg') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.js');
          if (res.ok && (underAstro || staticAsset)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
