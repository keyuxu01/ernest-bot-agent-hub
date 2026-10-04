/** 按 UTC+本地时区生成 `YYYY/MM/DD` 路径段，用于对象 key 分层 */
export function formatDatePath(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}
