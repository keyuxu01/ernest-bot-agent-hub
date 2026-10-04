import { IMAGE_EXTENSION_BY_CONTENT_TYPE } from '../constants/document-upload.constants';

/**
 * 给抽出的图片起一个扩展名，只影响对象 key，不决定是否保留该图
 * 常见位图走对照表；其余用 MIME 子类型（如 `image/x-emf` → `emf`）
 */
function imageExtensionForContentType(contentType: string): string {
  const known = IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType];
  if (known) return known;

  const subtype = /^image\/(?:x-)?([a-z0-9.+-]+)/i.exec(contentType)?.[1];
  return subtype?.split('+')[0] || 'bin';
}

export { imageExtensionForContentType };
