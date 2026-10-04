import { describe, expect, it } from 'vitest';
import { sanitizeBaseName } from './sanitize-base-name';

describe('sanitizeBaseName', () => {
  it('strips extension and keeps CJK / word chars', () => {
    expect(sanitizeBaseName('报告 Draft v1.pdf')).toBe('报告_Draft_v1');
  });

  it('falls back when name is only an extension', () => {
    expect(sanitizeBaseName('.gitignore')).toBe('file');
  });
});
