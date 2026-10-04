import { describe, expect, it } from 'vitest';
import { imageExtensionForContentType } from './image-extension';

describe('imageExtensionForContentType', () => {
  it('uses the common bitmap table', () => {
    expect(imageExtensionForContentType('image/jpeg')).toBe('jpg');
    expect(imageExtensionForContentType('image/png')).toBe('png');
  });

  it('keeps Word vector types instead of dropping them', () => {
    expect(imageExtensionForContentType('image/x-emf')).toBe('emf');
    expect(imageExtensionForContentType('image/x-wmf')).toBe('wmf');
  });

  it('falls back to bin when the type is not an image', () => {
    expect(imageExtensionForContentType('application/octet-stream')).toBe(
      'bin',
    );
    expect(imageExtensionForContentType('')).toBe('bin');
  });
});
