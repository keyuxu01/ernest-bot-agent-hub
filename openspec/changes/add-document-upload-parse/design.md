## Context

`DocumentModule` already creates documents with a MongoDB-first, PostgreSQL-second write and compensating delete (ADR-0013). `RustfsService` uploads bytes and returns path-style public URLs. There is no file upload endpoint. Motivation and scope: see `proposal.md`; behavior: see `specs/document-upload-parse/spec.md`.

MinerU cloud is not used: its pre-signed upload and result CDN are unreachable from overseas egress. Self-hosted MinerU is deferred (no GPU). This change uses the in-process parsers from the earlier knowledge-hub implementation.

## Goals / Non-Goals

**Goals:**

- A working synchronous upload → Markdown draft path for PDF, DOCX, XLSX, PPTX, TXT and MD.
- Keep conversion inside `modules/document/helpers` so a later MinerU or other engine can replace it without changing persistence.
- Store the body's images in RustFS so documents do not depend on temporary or `data:` URLs.

**Non-Goals:**

- Durable parse task records, background workers, retries, RabbitMQ commands or resumable parsing.
- Self-hosted or cloud MinerU.
- Chunking, indexing, or using structured layout JSON.
- `doc`, `ppt`, `xls`, image and HTML inputs.
- Cleaning up orphaned RustFS objects after a later failure.
- Persisting the document-to-source-file link (source URL, SHA-256, parser) in MongoDB or PostgreSQL.

## Decisions

### D1. In-process parsers, awaited in the request

| Type | Primary | Fallback |
| --- | --- | --- |
| txt / md | UTF-8 `TextDecoder` | — |
| pdf | `pdf-parse` (text, optional images, optional tables) | — |
| docx | `mammoth` → HTML → `turndown` + GFM | `officeparser` |
| xlsx | `exceljs` (visible sheets → Markdown tables) | `officeparser` |
| pptx | `fflate` + slide XML | `officeparser` |

Awaiting in the request is an explicit MVP exception to durable background processing.

### D2. Parsers are pure; orchestration owns storage

Each parser returns `{ markdown, images }` where `images` is keyed by the local Markdown reference (for example `images/d0.jpg`). `DocumentParseService` uploads those bytes to RustFS (`documents/images`) and rewrites links. Mammoth uses `convertImage` so the stored body never contains base64.

Types are inferred from Zod schemas in `modules/document/schemas/document-upload.zod.ts`. The `parser` field in the response is the engine that actually produced the Markdown (`mammoth`, `exceljs`, `pptx-xml`, `officeparser`, `pdf-parse`, `plain-text`).

### D3. Orchestration in `DocumentParseService`, persistence through `DocumentService`

Order: validate extension → convert → reject empty results → upload original to RustFS (`documents/sources`) → upload images and rewrite links → `DocumentService.create(dto)`.

`DocumentService`, its repositories and the `document_content` / `kh_document` shapes are unchanged. Source file metadata is returned in the response only.

### D4. In-memory Office ZIP extraction with `fflate`

Multer memory storage with a 50 MB `fileSize` limit. PPTX (and any later ZIP-backed format) is unzipped with `fflate.unzipSync`, rejecting absolute / `..` paths and capping the declared uncompressed total (256 MB). Nothing touches local disk.

### D5. Stable error responses

Errors use `HttpException` bodies shaped `{ statusCode, code, message }` with codes from the spec. Multer's `PayloadTooLargeException` is mapped to `DOCUMENT_FILE_TOO_LARGE`. Parser library messages are logged, not returned.

### D6. File name decoding

Multer 2 decodes multipart file names as Latin-1 by default. The upload route sets `defParamCharset: 'utf8'` on `FileInterceptor`.

## Risks / Trade-offs

- [Scanned PDFs and complex Office files convert poorly] → Accepted for MVP; MinerU or another layout engine is the documented upgrade.
- [Long files can block the request] → Accepted for single-user MVP; a persistent task is the next step.
- [Unbounded concurrent uploads hold files in memory] → Acceptable for MVP; add a concurrency limit before multi-tenant use.
- [RustFS objects are orphaned if database writes fail after upload] → Logged; reconciliation cleanup deferred.
- [ZIP central-directory sizes can be forged] → Entry filter and declared-size cap reduce exposure.

## Migration Plan

Additive endpoint only; no schema change or data migration. Rollback is removing the route; created drafts remain valid documents.
