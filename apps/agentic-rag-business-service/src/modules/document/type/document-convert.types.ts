import type { DocumentParser } from './document-upload.types';

/** 解析过程中抽出的图片，尚未上传 */
type ExtractedImage = {
  bytes: Uint8Array;
  contentType: string;
  /** 上传到对象存储时使用的文件名 */
  fileName: string;
};

/**
 * 单个格式解析器的产出
 * `markdown` 中的图片写成本地引用（如 `images/p1-0.png`），`images` 以该引用为键；
 * 上传与链接改写由调用方负责，解析器本身不做 I/O。
 */
type ParsedMarkdown = {
  markdown: string;
  images: Map<string, ExtractedImage>;
};

/** 分发后的最终结果，附带实际使用的解析引擎（可看出是否走了兜底） */
type ConvertedDocument = ParsedMarkdown & { parser: DocumentParser };

export type { ConvertedDocument, ExtractedImage, ParsedMarkdown };
