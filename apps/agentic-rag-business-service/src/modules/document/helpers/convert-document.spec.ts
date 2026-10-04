import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseXlsx, parseOfficeFallback } = vi.hoisted(() => ({
  parseXlsx: vi.fn(),
  parseOfficeFallback: vi.fn(),
}));

vi.mock('./parse-xlsx', () => ({ parseXlsx }));
vi.mock('./parse-office-fallback', () => ({ parseOfficeFallback }));
vi.mock('./parse-docx', () => ({ parseDocx: vi.fn() }));
vi.mock('./parse-pdf', () => ({ parsePdf: vi.fn() }));
vi.mock('./parse-pptx', () => ({ parsePptx: vi.fn() }));
vi.mock('./parse-plain-text', () => ({
  parsePlainText: () => ({ markdown: 'plain', images: new Map() }),
}));

import { convertDocument } from './convert-document';

describe('convertDocument', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the primary parser when exceljs succeeds', async () => {
    parseXlsx.mockResolvedValue({ markdown: '| a |', images: new Map() });

    await expect(convertDocument('xlsx', Buffer.from('x'))).resolves.toEqual({
      markdown: '| a |',
      images: new Map(),
      parser: 'exceljs',
    });
    expect(parseOfficeFallback).not.toHaveBeenCalled();
  });

  it('falls back to officeparser when the primary parser throws', async () => {
    parseXlsx.mockRejectedValue(new Error('corrupt workbook'));
    parseOfficeFallback.mockResolvedValue({
      markdown: '## Sheet',
      images: new Map(),
    });

    await expect(convertDocument('xlsx', Buffer.from('x'))).resolves.toEqual({
      markdown: '## Sheet',
      images: new Map(),
      parser: 'officeparser',
    });
  });

  it('falls back when the primary parser returns only whitespace', async () => {
    parseXlsx.mockResolvedValue({ markdown: '  \n', images: new Map() });
    parseOfficeFallback.mockResolvedValue({
      markdown: 'recovered',
      images: new Map(),
    });

    await expect(
      convertDocument('xlsx', Buffer.from('x')),
    ).resolves.toMatchObject({ parser: 'officeparser', markdown: 'recovered' });
  });
});
