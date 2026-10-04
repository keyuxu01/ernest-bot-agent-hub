## Why

Documents can currently only be created by posting Markdown text. Most knowledge comes from PDF and Office files, so users need to upload a file and get a draft whose body is Markdown, with images stored in our own object storage. The MinerU cloud API is unreachable from overseas egress (its upload and result hosts sit on mainland China object storage). Self-hosted MinerU needs GPU infrastructure we do not have yet. The MVP therefore parses each format in the NestJS process.

## What Changes

- Add `POST /documents/upload/parse`, a multipart endpoint accepting one file (`pdf`, `docx`, `xlsx`, `pptx`, `txt`, `md`) up to 50 MB plus optional document metadata fields.
- Read `txt` / `md` as UTF-8. Convert `pdf` / `docx` / `xlsx` / `pptx` in-process (`pdf-parse`, `mammoth` + `turndown`, `exceljs`, OOXML for PPTX). DOCX / XLSX / PPTX fall back to `officeparser` when the primary parser fails or yields empty Markdown.
- After a successful conversion, store the original file and extracted images in RustFS and rewrite image links to RustFS URLs. Parsers must not write `data:` URIs into the body.
- Persist the result as a draft through the existing PostgreSQL metadata + MongoDB content flow, unchanged. The document-to-source-file link is not persisted yet; source metadata is returned in the response only.
- Return a draft summary JSON; map validation and parse failures to stable error codes.
- Supersede ADR-0014 with ADR-0015 and update the architecture overview. There is no MinerU client and no `MINERU_*` configuration.

## Capabilities

### New Capabilities

- `document-upload-parse`: Uploading a source file, converting it to a Markdown draft document, storing original files and extracted images, and reporting parse failures.

### Modified Capabilities

None. Document CRUD has no main OpenSpec spec yet, and its existing behavior does not change.

## Impact

- Code: `apps/agentic-rag-business-service` — upload/parse orchestration and per-format parsers in `src/modules/document`. No database schema changes.
- API: new `POST /documents/upload/parse`; existing document endpoints unchanged.
- Dependencies: `pdf-parse`, `mammoth`, `turndown`, `turndown-plugin-gfm`, `exceljs`, `officeparser`, `fflate` (PPTX ZIP), `zod`.
- External systems: none for parsing. File bytes stay in the service process.
- Docs: `docs/architecture/README.md`, ADR-0014 superseded, new ADR-0015.
