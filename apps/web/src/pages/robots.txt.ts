import type { APIRoute } from 'astro';
import { ROUTES } from '../lib/url.js';

/**
 * robots.txt 由构建期生成，而不是手写静态文件。
 *
 * 手写的话，sitemap 地址里的域名就成了第二处硬编码的站点 URL，
 * 换域名或加部署前缀时必然漏改一处——而这类错误不会让构建失败，
 * 只会让搜索引擎拿到一个 404 的 sitemap，且没人会立刻发现。
 */
export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${ROUTES.sitemap()}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
