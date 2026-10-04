import type { z } from 'zod';
import type {
  documentFileTypeSchema,
  documentParserSchema,
  documentUploadErrorCodeSchema,
  uploadedDocumentFileSchema,
  uploadParseDocumentResultSchema,
} from '../schemas/document-upload.zod';

type DocumentFileType = z.infer<typeof documentFileTypeSchema>;
type DocumentParser = z.infer<typeof documentParserSchema>;
type DocumentUploadErrorCode = z.infer<typeof documentUploadErrorCodeSchema>;
type UploadedDocumentFile = z.infer<typeof uploadedDocumentFileSchema>;
type UploadParseDocumentResult = z.infer<
  typeof uploadParseDocumentResultSchema
>;

export type {
  DocumentFileType,
  DocumentParser,
  DocumentUploadErrorCode,
  UploadedDocumentFile,
  UploadParseDocumentResult,
};
