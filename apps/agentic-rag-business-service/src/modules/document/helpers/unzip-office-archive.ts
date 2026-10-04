import { unzipSync } from 'fflate';
import { MAX_OFFICE_UNCOMPRESSED_BYTES } from '../constants/document-upload.constants';

/**
 * 归一化归档路径：统一 `/`，去掉 `.` 与空段
 * 绝对路径、盘符路径或含 `..` 的路径视为不安全，返回 null
 */
function normalizeArchivePath(entryName: string): string | null {
  const unified = entryName.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) return null;

  const segments: string[] = [];
  for (const segment of unified.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
}

/**
 * 按需解压 Office 压缩包（纯内存）
 * 只解出 `keep` 接受的条目，并限制声明的解压总量
 *
 * @throws Error 超出大小上限或 ZIP 损坏
 */
function unzipOfficeEntries(
  zip: Uint8Array,
  keep: (path: string) => boolean,
): Map<string, Uint8Array> {
  let declaredTotal = 0;
  const entries = unzipSync(zip, {
    filter(file) {
      const path = normalizeArchivePath(file.name);
      if (!path || !keep(path)) return false;

      // originalSize 来自中央目录、可被伪造，只能作为粗粒度防线
      declaredTotal += file.originalSize;
      if (declaredTotal > MAX_OFFICE_UNCOMPRESSED_BYTES) {
        throw new Error(
          `Office archive exceeds ${MAX_OFFICE_UNCOMPRESSED_BYTES} uncompressed bytes`,
        );
      }
      return true;
    },
  });

  const files = new Map<string, Uint8Array>();
  for (const [entryName, bytes] of Object.entries(entries)) {
    const path = normalizeArchivePath(entryName);
    if (path) files.set(path, bytes);
  }
  return files;
}

export { normalizeArchivePath, unzipOfficeEntries };
