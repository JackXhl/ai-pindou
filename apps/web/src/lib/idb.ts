/**
 * IndexedDB 封装。草稿等大对象走这里，不走 localStorage。
 */

import { DB_NAME, DB_VERSION, STORE } from './storage.js';

export interface DraftRecord {
  id: string;
  title: string;
  updatedAt: number;
  paletteId: string;
  cols: number;
  rows: number;
  /** 色号列表 JSON 可序列化 */
  colors: { code: string; name: string; hex: string; lab: [number, number, number] }[];
  /** grid 以普通数组存，读出再还原 Uint16Array */
  grid: number[];
  /** 小缩略图 data URL，可选 */
  thumb?: string;
  prefs?: Record<string, unknown>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE.drafts)) {
        const store = db.createObjectStore(STORE.drafts, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE.progress)) {
        db.createObjectStore(STORE.progress, { keyPath: 'patternId' });
      }
      if (!db.objectStoreNames.contains(STORE.favorites)) {
        db.createObjectStore(STORE.favorites, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务中止'));
  });
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE.drafts, 'readonly');
    const store = tx.objectStore(STORE.drafts);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as DraftRecord[]).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getDraft(id: string): Promise<DraftRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE.drafts, 'readonly');
    const req = tx.objectStore(STORE.drafts).get(id);
    req.onsuccess = () => resolve((req.result as DraftRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putDraft(draft: DraftRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE.drafts, 'readwrite');
  tx.objectStore(STORE.drafts).put(draft);
  await txDone(tx);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE.drafts, 'readwrite');
  tx.objectStore(STORE.drafts).delete(id);
  await txDone(tx);
}

export function newDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
