/** 统一换行、去掉行尾空白、把连续空行压成一行空行 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 单元格里的 `|` 与换行会破坏表格结构 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/**
 * 二维数组 → GFM 表格，首行作表头
 * 列数取所有行的最大值，短行右侧补空单元格；没有任何单元格时返回空串
 */
function toMarkdownTable(rows: readonly (readonly string[])[]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) return '';

  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, i) => escapeTableCell(cells[i] ?? '')).join(' | ')} |`;
  const [header = [], ...body] = rows;

  return [
    line(header),
    `| ${Array<string>(width).fill('---').join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

export { cleanMarkdown, toMarkdownTable };
