import ExcelJS from 'exceljs';
import { cleanMarkdown, toMarkdownTable } from './markdown-format';
import type { ParsedMarkdown } from '../type/document-convert.types';

/**
 * XLSX → Markdown
 *
 * 每个可见 Sheet → `## 名称` + 首行作表头的表格。
 * 隐藏 Sheet 视为底稿，不进入知识正文；空 Sheet 仍保留标题，避免丢掉 sheet 名。
 */
async function parseXlsx(bytes: Buffer): Promise<ParsedMarkdown> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

  const parts: string[] = [];

  workbook.eachSheet((sheet) => {
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') return;

    parts.push(`## ${sheet.name}`);

    const rows: string[][] = [];
    let maxCols = 0;

    sheet.eachRow({ includeEmpty: false }, (row) => {
      // exceljs `row.values` 下标从 1 起；稀疏行的 actualCellCount 可能小于真实末列
      const values = row.values as Array<ExcelJS.CellValue | undefined>;
      const last = Math.max(row.actualCellCount, (values?.length ?? 1) - 1);
      maxCols = Math.max(maxCols, last);
      const cells: string[] = [];
      for (let c = 1; c <= last; c++) {
        cells.push(cellToString(row.getCell(c).value));
      }
      rows.push(cells);
    });

    if (maxCols === 0 || rows.length === 0) {
      parts.push('');
      return;
    }

    const normalized = rows.map((row) => {
      const copy = [...row];
      while (copy.length < maxCols) copy.push('');
      return copy;
    });
    parts.push(toMarkdownTable(normalized));
  });

  return { markdown: cleanMarkdown(parts.join('\n\n')), images: new Map() };
}

/**
 * exceljs 单元格 → 展示字符串
 * 错误值是 `{ error: '#DIV/0!' }`，不能 `String(value)`，否则会变成 `[object Object]`
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);

  if ('error' in value && value.error != null) return String(value.error);
  // 公式格优先展示计算结果，而不是 `=A1+1`
  if ('result' in value && value.result != null) {
    return cellToString(value.result as ExcelJS.CellValue);
  }
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((run) => run.text).join('');
  }
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as { result?: ExcelJS.CellValue }).result;
    return result != null ? cellToString(result) : '';
  }
  return '';
}

export { parseXlsx };
