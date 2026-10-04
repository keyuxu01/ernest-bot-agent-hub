import { PayloadTooLargeException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_FILE_BYTES } from '../constants/document-upload.constants';
import { DocumentFileTooLargeFilter } from './document-file-too-large.filter';

describe('DocumentFileTooLargeFilter', () => {
  it('maps Multer size errors to DOCUMENT_FILE_TOO_LARGE', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new DocumentFileTooLargeFilter().catch(
      new PayloadTooLargeException('File too large'),
      host,
    );

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      code: 'DOCUMENT_FILE_TOO_LARGE',
      message: `File exceeds ${MAX_UPLOAD_FILE_BYTES} bytes`,
    });
  });
});
