/**
 * URL 构造的唯一出口。
 *
 * **全项目禁止手写站内路径与域名字符串。**
 *
 * 原因很具体：站点同时受三个变量影响——部署前缀（base）、强制尾斜杠
 * （trailingSlash: 'always'）、语言前缀（中文在根、英文在 /en/）。
 * 三者两两组合就有八种拼错的方式，而拼错的表现往往是构建正常、
 * 线上 404，或者更糟：canonical 指向一个不存在的地址，搜索引擎按它去索引。
 *
 * 把这些规则收敛到一个文件，改部署形态时只改这里。
 */

export const DEFAULT_LOCALE = 'zh' as const;
export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** 部署前缀。子域名部署时为 '/'。 */
const BASE = import.meta.env.BASE_URL || '/';

/** 站点绝对 URL 基准，仅在此处读取一次 */
const SITE = (import.meta.env.SITE ?? 'http://localhost:4321').replace(
  /\/+$/,
  '',
);

/** 归一化：确保以 base 开头、以斜杠结尾、且无重复斜杠 */
function normalize(pathname: string): string {
  const joined = `${BASE}/${pathname}`.replace(/\/{2,}/g, '/');
  // 文件（带扩展名）不加尾斜杠，其余一律补上
  if (/\.[a-z0-9]+$/i.test(joined)) return joined;
  return joined.endsWith('/') ? joined : `${joined}/`;
}

/**
 * 构造站内路径。
 * @param segments 路径片段，无需关心斜杠
 */
export function path(...segments: (string | number)[]): string {
  return normalize(segments.map(String).join('/'));
}

/**
 * 构造带语言前缀的站内路径。
 * 中文是默认语言，不加前缀；其余语言加 /<locale>/。
 */
export function localePath(
  locale: Locale,
  ...segments: (string | number)[]
): string {
  return locale === DEFAULT_LOCALE
    ? path(...segments)
    : path(locale, ...segments);
}

/** 站内路径转绝对 URL，用于 canonical、OG、sitemap */
export function absolute(pathname: string): string {
  return `${SITE}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/** 从当前 URL 推断语言 */
export function localeFromPath(pathname: string): Locale {
  const stripped = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length)
    : pathname;
  const first = stripped.split('/').filter(Boolean)[0];
  return first && isLocale(first) ? first : DEFAULT_LOCALE;
}

/**
 * 去掉路径里的语言前缀，得到「与语言无关」的部分。
 * hreflang 需要用它拼出同一页面的各语言版本。
 */
export function stripLocale(pathname: string): string {
  const stripped = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length)
    : pathname;
  const parts = stripped.split('/').filter(Boolean);
  if (parts.length > 0 && isLocale(parts[0]!)) parts.shift();
  return parts.join('/');
}

export interface AlternateLink {
  locale: Locale | 'x-default';
  href: string;
}

/**
 * 生成 hreflang 备用链接。
 *
 * x-default 指向中文版：目标用户以中文使用者为主，
 * 让未匹配到语言的访问者落到中文页比落到英文页合理。
 */
export function alternates(pathname: string): AlternateLink[] {
  const bare = stripLocale(pathname);
  const links: AlternateLink[] = LOCALES.map((locale) => ({
    locale,
    href: absolute(localePath(locale, bare)),
  }));
  links.push({
    locale: 'x-default',
    href: absolute(localePath(DEFAULT_LOCALE, bare)),
  });
  return links;
}

/** 站点级固定地址，同样不允许在别处硬编码 */
export const ROUTES = {
  home: () => path(),
  editor: () => path('editor'),
  palettes: () => path('palette'),
  palette: (id: string) => path('palette', id),
  convert: (from: string, to: string) => path('palette', from, 'convert', to),
  size: (mm: string) => path('size', mm),
  guide: (topic: string) => path('guide', topic),
  patterns: () => path('patterns'),
  pattern: (id: string) => path('patterns', id),
  sitemap: () => absolute(path('sitemap-index.xml')),
} as const;

/** 意见反馈外链，可在 .env 配置 PUBLIC_FEEDBACK_URL */
export function feedbackUrl(): string {
  const url = import.meta.env.PUBLIC_FEEDBACK_URL;
  if (url && typeof url === 'string' && url.length > 0) return url;
  return 'https://github.com/JackXhl/ai-pindou/issues/new';
}

/**
 * public/ 下静态资源路径（favicon、sw、manifest）。
 * 必须走 base，否则子路径部署时会请求到域名根并触发 Astro 报错。
 */
export function publicAsset(...segments: string[]): string {
  return path(...segments);
}
