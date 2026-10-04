## 1. Setup and Configuration

- [x] 1.1 Add `pdf-parse`, `mammoth`, `turndown`, `turndown-plugin-gfm`, `exceljs`, `officeparser`, `fflate` and `zod`; verify `pnpm install` succeeds and the lockfile updates.
- [x] 1.2 Remove `MINERU_*` from `validateEnvironment`, `.env.example` and `.env.dev`; verify environment tests no longer require MinerU variables.

## 2. In-process parsers

- [x] 2.1 Add per-format parsers (`plain-text`, `pdf`, `docx`, `xlsx`, `pptx`) plus `officeparser` fallback and a `convertDocument` dispatcher; verify unit tests for XLSX tables/hidden sheets/error cells, PPTX slide order/entities, and fallback when the primary parser throws or is empty.

## 3. Document Conversion Helpers

- [x] 3.1 Add Zod-inferred upload types and extension detection; set `defParamCharset: 'utf8'` for multipart file names; verify unit tests including Chinese names, uppercase extensions and default titles.
- [x] 3.2 Add Office ZIP extraction (reject unsafe paths, size cap) and Markdown table / image helpers; verify unit tests.
- [x] 3.3 Add Markdown image reference rewriting; verify unit tests for relative paths, titles and missing images.

## 4. Upload and Parse Flow

- [x] 4.1 Reuse `DocumentService.create` unchanged (no `source` persistence); return source file metadata in the upload response only; verify by type-check and unit tests.
- [x] 4.2 Implement `DocumentParseService` (validate, convert, store original and images, rewrite, persist, summarize) with stable error mapping; verify unit tests for the Markdown path, image rewrite, unsupported type, empty content and converter exceptions.
- [x] 4.3 Add `POST /documents/upload/parse` with `FileInterceptor` (50 MB limit), `UploadParseDocumentDto` and the `DOCUMENT_FILE_TOO_LARGE` exception filter; import `RustfsModule` into `DocumentModule`; verify with a filter unit test and the `.http` example.

## 5. Architecture Documentation

- [x] 5.1 Supersede ADR-0014 with ADR-0015 (in-process parsers) and update `docs/architecture/README.md` system context, document parsing boundary and ADR index; verify links resolve.

## 6. Verification

- [x] 6.1 Run the service's `lint`, `check-types`, `test` and `build`; verify all pass.
- [x] 6.2 Run `openspec validate add-document-upload-parse --strict`; verify it passes.
