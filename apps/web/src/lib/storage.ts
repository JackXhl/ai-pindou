/**
 * 本地存储封装。
 *
 * 统一走 aipindou 命名空间，原因有二：
 *
 * 1. localStorage 按源（origin）共享。同一台服务器上的多个服务若共用父域，
 *    裸键名（如 'settings'、'draft'）迟早互相覆盖，且排查时极难联想到
 *    是隔壁服务写坏的。
 * 2. 产品不做登录，用户的全部数据都在本地。清理、迁移、导出都需要能
 *    「一次性圈出属于本站的所有键」。
 *
 * 所有读写都做了容错：Safari 无痕模式下 localStorage 存在但写入即抛异常，
 * 不兜住会让整个页面白屏。存储失败只应降级，不应中断用户正在做的事。
 */

export const NAMESPACE = 'aipindou';

/** 存储结构版本。改变已有键的数据结构时递增，配合迁移逻辑使用。 */
export const STORAGE_VERSION = 1;

/** IndexedDB 库名与版本，草稿与摆豆进度存在这里 */
export const DB_NAME = `${NAMESPACE}-db`;
export const DB_VERSION = 1;

export const STORE = {
  drafts: 'drafts',
  progress: 'progress',
  favorites: 'favorites',
} as const;

/** 键名登记。集中在此便于审计「本站到底往用户浏览器里写了什么」。 */
export const KEYS = {
  locale: 'locale',
  myPalette: 'my-palette',
  editorPrefs: 'editor-prefs',
  craftPrefs: 'craft-prefs',
  craftProgress: 'craft-progress',
  lastSpec: 'last-spec',
  disclaimerAck: 'disclaimer-ack',
  canvasView: 'canvas-view',
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

const fullKey = (key: string) => `${NAMESPACE}:${STORAGE_VERSION}:${key}`;

function available(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function read<T>(key: StorageKey, fallback: T): T {
  if (!available()) return fallback;
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // 数据损坏或结构变更时静默回退，不能让一条坏记录卡死整个页面
    return fallback;
  }
}

export function write(key: StorageKey, value: unknown): boolean {
  if (!available()) return false;
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value));
    return true;
  } catch {
    // 配额超限或无痕模式。调用方应据此提示用户，而不是假装保存成功。
    return false;
  }
}

export function remove(key: StorageKey): void {
  if (!available()) return;
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    /* 忽略 */
  }
}

/** 列出本站写入的所有键，供「清除我的数据」使用 */
export function listOwnKeys(): string[] {
  if (!available()) return [];
  const prefix = `${NAMESPACE}:`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
  } catch {
    return [];
  }
  return keys;
}

/** 清空本站数据。必须只删自己命名空间下的键，绝不整体 clear()。 */
export function clearOwnData(): void {
  if (!available()) return;
  for (const key of listOwnKeys()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* 忽略 */
    }
  }
}
