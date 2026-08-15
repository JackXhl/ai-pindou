import { DEFAULT_LOCALE, type Locale } from '../lib/url.js';
import { en } from './en.js';
import { zh, type Dictionary } from './zh.js';

/**
 * 文案字典。
 *
 * 不引入 i18n 库：站点只有两种语言、文案量有限，而任何一个 i18n 运行时
 * 都会带来额外的包体积和一层间接。用普通对象加类型约束就够了，
 * 且漏翻会在构建期直接报类型错误。
 */
const dictionaries: Record<Locale, Dictionary> = { zh, en };

export function useTranslations(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] ?? zh;
}

export type { Dictionary };
export { zh, en };
