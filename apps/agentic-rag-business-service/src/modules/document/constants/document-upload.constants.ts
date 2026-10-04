/** 单文件上传上限（产品限制） */
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;

/** docx / xlsx / pptx 解压后的总大小上限，防 ZIP 炸弹 */
const MAX_OFFICE_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

/** RustFS 对象 key 前缀：原文件与正文图片分开，便于后续按前缀清理 */
const DOCUMENT_SOURCE_PREFIX = 'documents/sources';
const DOCUMENT_IMAGE_PREFIX = 'documents/images';

/** 未传标题且文件名去掉扩展名后为空时的占位标题 */
const UNTITLED_DOCUMENT_TITLE = '未命名文档';

/** 常见位图 MIME → 扩展名；其他类型由 `imageExtensionForContentType` 从子类型推导 */
const IMAGE_EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

export {
  DOCUMENT_IMAGE_PREFIX,
  DOCUMENT_SOURCE_PREFIX,
  IMAGE_EXTENSION_BY_CONTENT_TYPE,
  MAX_OFFICE_UNCOMPRESSED_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  UNTITLED_DOCUMENT_TITLE,
};
