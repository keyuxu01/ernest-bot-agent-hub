import { HttpException, HttpStatus } from '@nestjs/common';
import type { DocumentLifecycleErrorCode } from '../type/document-lifecycle.types';

/** 业务错误响应体 `{ statusCode, code, message }`，与上传解析错误同形 */
function documentLifecycleError(
  code: DocumentLifecycleErrorCode,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

export { documentLifecycleError };
