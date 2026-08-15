/** 触发浏览器下载。统一出口，避免各处手写 a 标签。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，避免部分浏览器下载尚未开始就失效
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stampFilename(base: string, ext: string): string {
  const safe = base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 40);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${safe || 'aipindou'}-${stamp}.${ext}`;
}
