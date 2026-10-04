/** `RustfsService.uploadBytes` 入参 */
export type UploadBytesOptions = {
  fileName: string;
  contentType: string;
  /** 对象 key 前缀，默认 documents */
  prefix?: string;
};
