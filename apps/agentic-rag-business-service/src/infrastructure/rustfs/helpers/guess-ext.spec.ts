import { describe, expect, it } from 'vitest';
import { guessExt } from './guess-ext';

describe('guessExt', () => {
  it('maps common content types', () => {
    expect(guessExt('image/png')).toBe('.png');
    expect(guessExt('application/pdf')).toBe('.pdf');
  });

  it('returns empty string for unknown types', () => {
    expect(guessExt('application/octet-stream')).toBe('');
  });
});
