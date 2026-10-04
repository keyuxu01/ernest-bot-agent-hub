/**
 * 去掉扩展名后清洗文件名：保留中英文、数字、`.` `-` `_`，其余替换为 `_`，最长 64。
 */
export function sanitizeBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'file';
  return base.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 64);
}
