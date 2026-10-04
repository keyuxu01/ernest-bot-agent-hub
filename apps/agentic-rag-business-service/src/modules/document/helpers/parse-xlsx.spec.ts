import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseXlsx } from './parse-xlsx';

async function workbookBytes(
  build: (workbook: ExcelJS.Workbook) => void,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseXlsx', () => {
  it('turns visible sheets into Markdown tables and skips hidden ones', async () => {
    const bytes = await workbookBytes((workbook) => {
      const sheet = workbook.addWorksheet('销售');
      sheet.addRow(['指标', '数值']);
      sheet.addRow(['收入', 100]);
      sheet.addRow(['含|竖线', '换\n行']);

      const hidden = workbook.addWorksheet('隐藏');
      hidden.state = 'hidden';
      hidden.addRow(['secret']);
    });

    const { markdown, images } = await parseXlsx(bytes);

    expect(images.size).toBe(0);
    expect(markdown).toContain('## 销售');
    expect(markdown).toContain('| 指标 | 数值 |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| 收入 | 100 |');
    expect(markdown).toContain('| 含\\|竖线 | 换 行 |');
    expect(markdown).not.toContain('隐藏');
    expect(markdown).not.toContain('secret');
  });

  it('renders formula results and error codes instead of [object Object]', async () => {
    const bytes = await workbookBytes((workbook) => {
      const sheet = workbook.addWorksheet('公式');
      sheet.addRow(['结果', '错误']);
      sheet.addRow([{ formula: '1+1', result: 2 }, { error: '#DIV/0!' }]);
    });

    const { markdown } = await parseXlsx(bytes);

    expect(markdown).toContain('| 2 | #DIV/0! |');
    expect(markdown).not.toContain('[object Object]');
  });
});
