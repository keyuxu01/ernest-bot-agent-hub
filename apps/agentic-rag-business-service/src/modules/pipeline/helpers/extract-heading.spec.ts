import { describe, expect, it } from 'vitest';
import { extractHeading } from './extract-heading';

describe('extractHeading', () => {
  it('returns the first ATX heading text', () => {
    expect(extractHeading('## 背景\n\n正文')).toBe('背景');
  });

  it('returns null when the chunk has no heading', () => {
    expect(extractHeading('只有正文')).toBeNull();
  });
});
