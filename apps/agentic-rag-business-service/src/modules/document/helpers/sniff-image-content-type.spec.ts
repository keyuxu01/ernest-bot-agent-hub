import { describe, expect, it } from 'vitest';
import { sniffImageContentType } from './sniff-image-content-type';

describe('sniffImageContentType', () => {
  it('recognizes JPEG / PNG / GIF / WebP / BMP magic bytes', () => {
    expect(sniffImageContentType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffImageContentType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
      ),
    ).toBe('image/png');
    expect(
      sniffImageContentType(
        new Uint8Array([0x47, 0x49, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBe('image/gif');
    expect(
      sniffImageContentType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
    expect(sniffImageContentType(new Uint8Array([0x42, 0x4d]))).toBe(
      'image/bmp',
    );
  });

  it('returns undefined for unknown bytes', () => {
    expect(sniffImageContentType(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
