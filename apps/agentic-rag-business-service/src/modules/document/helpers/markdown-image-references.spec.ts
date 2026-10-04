import { describe, expect, it } from 'vitest';
import {
  findImageReferences,
  replaceImageReferences,
} from './markdown-image-references';

const markdown = [
  '# Title',
  '![chart](images/a.jpg)',
  '![](images/b.png "Caption")',
  '![again](images/a.jpg)',
  '![remote](https://cdn.test/c.jpg)',
  '[not an image](images/d.jpg)',
].join('\n');

describe('findImageReferences', () => {
  it('collects unique image sources in order and ignores plain links', () => {
    expect(findImageReferences(markdown)).toEqual([
      'images/a.jpg',
      'images/b.png',
      'https://cdn.test/c.jpg',
    ]);
  });
});

describe('replaceImageReferences', () => {
  it('rewrites mapped references and keeps alt and title', () => {
    const urls: Record<string, string> = {
      'images/a.jpg': 'http://rustfs/a.jpg',
      'images/b.png': 'http://rustfs/b.png',
    };

    const result = replaceImageReferences(markdown, (ref) => urls[ref]);

    expect(result).toContain('![chart](http://rustfs/a.jpg)');
    expect(result).toContain('![again](http://rustfs/a.jpg)');
    expect(result).toContain('![](http://rustfs/b.png "Caption")');
    expect(result).toContain('![remote](https://cdn.test/c.jpg)');
    expect(result).toContain('[not an image](images/d.jpg)');
  });

  it('leaves the text unchanged when nothing is mapped', () => {
    expect(replaceImageReferences(markdown, () => undefined)).toBe(markdown);
  });
});
