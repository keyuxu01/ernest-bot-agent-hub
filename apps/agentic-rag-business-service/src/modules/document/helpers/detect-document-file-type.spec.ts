import { describe, expect, it } from 'vitest';
import {
  detectDocumentFileType,
  isPlainTextFileType,
} from './detect-document-file-type';

describe('detectDocumentFileType', () => {
  it.each([
    ['report.pdf', 'pdf'],
    ['季度报告.DOCX', 'docx'],
    ['sheet.v2.xlsx', 'xlsx'],
    ['slides.PpTx', 'pptx'],
    ['notes.txt', 'txt'],
    ['README.md', 'md'],
  ])('detects %s as %s', (fileName, expected) => {
    expect(detectDocumentFileType(fileName)).toBe(expected);
  });

  it.each(['legacy.doc', 'image.png', 'archive.zip', 'noext', 'trailing.'])(
    'rejects %s',
    (fileName) => {
      expect(detectDocumentFileType(fileName)).toBeNull();
    },
  );
});

describe('isPlainTextFileType', () => {
  it('treats only txt and md as plain text', () => {
    expect(isPlainTextFileType('txt')).toBe(true);
    expect(isPlainTextFileType('md')).toBe(true);
    expect(isPlainTextFileType('pdf')).toBe(false);
  });
});
