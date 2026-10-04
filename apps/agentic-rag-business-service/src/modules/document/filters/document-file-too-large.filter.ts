import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MAX_UPLOAD_FILE_BYTES } from '../constants/document-upload.constants';
import type { DocumentUploadErrorCode } from '../type/document-upload.types';

const CODE: DocumentUploadErrorCode = 'DOCUMENT_FILE_TOO_LARGE';

/**
 * Multer 超出 `fileSize` 时在进入 handler 前抛 `PayloadTooLargeException`，
 * 这里把它映射为上传解析的稳定错误码 `DOCUMENT_FILE_TOO_LARGE`。
 */
@Catch(PayloadTooLargeException)
class DocumentFileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: CODE,
        message: `File exceeds ${MAX_UPLOAD_FILE_BYTES} bytes`,
      });
  }
}

export { DocumentFileTooLargeFilter };
