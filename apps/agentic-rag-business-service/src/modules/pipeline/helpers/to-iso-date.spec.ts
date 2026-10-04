import { describe, expect, it } from 'vitest';
import { toIsoDate } from './to-iso-date';

describe('toIsoDate', () => {
  it('converts a Date to ISO-8601', () => {
    expect(toIsoDate(new Date('2026-10-04T00:00:00.000Z'))).toBe(
      '2026-10-04T00:00:00.000Z',
    );
  });

  it('returns null for empty or invalid values', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate('not-a-date')).toBeNull();
  });
});
