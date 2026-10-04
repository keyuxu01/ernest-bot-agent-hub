import { describe, expect, it } from 'vitest';
import { cleanMarkdown, toMarkdownTable } from './markdown-format';

describe('cleanMarkdown', () => {
  it('normalizes newlines and collapses blank lines', () => {
    expect(cleanMarkdown('a\r\n\r\n\r\n\r\nb  \n')).toBe('a\n\nb');
  });
});

describe('toMarkdownTable', () => {
  it('uses the first row as header and pads short rows', () => {
    expect(toMarkdownTable([['A', 'B'], ['1']])).toBe(
      ['| A | B |', '| --- | --- |', '| 1 |  |'].join('\n'),
    );
  });

  it('returns empty string when there are no cells', () => {
    expect(toMarkdownTable([])).toBe('');
    expect(toMarkdownTable([[]])).toBe('');
  });
});
