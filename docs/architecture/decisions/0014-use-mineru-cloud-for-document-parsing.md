# ADR-0014: Use the MinerU Cloud API for Document Parsing

- Status: Superseded
- Date: 2026-10-04
- Superseded by: [ADR-0015](./0015-use-in-process-document-parsers.md)

## Context

Uploaded PDF, DOCX, XLSX and PPTX files must become Markdown documents whose images live in project object
storage. Implementing one parser per format (`pdf-parse`, `exceljs`, `mammoth` + `turndown`, OOXML parsing
and an `officeparser` fallback) keeps parsing in Node.js but multiplies maintenance and still yields weak
layout, table and formula fidelity.

MinerU provides layout-aware conversion for all of these formats, through two different HTTP surfaces:

- The self-hosted V1 API (`/v1/uploads`, `/v1/parse/jobs`, `/v1/files/{id}/content`). Its upload, file and
  job index is process memory and is lost on restart. The 4.x Docker image targets Linux + NVIDIA; Apple
  Silicon requires a direct macOS installation.
- The official cloud at `mineru.net`: a token-authenticated precise API (`/api/v4/...`, ≤ 200 MB and
  ≤ 200 pages per file, ZIP result with `full.md` and `images/`) and a token-free lightweight Agent API
  (≤ 10 MB / 20 pages, Markdown link only).

The project currently has no GPU infrastructure and no durable parse-task model.

## Decision

- Parse PDF, DOCX, XLSX and PPTX through the MinerU cloud precise API using the batch upload-URL flow:
  request a pre-signed upload URL, `PUT` the bytes, poll the batch result, download the result ZIP.
- Read TXT and Markdown directly as UTF-8; they never leave the service.
- Keep the MinerU protocol inside `src/infrastructure/mineru`. Document orchestration depends only on
  "bytes and file name in, result archive out", so a self-hosted V1 client can replace it.
- Send the MinerU token only to the configured API origin, never to pre-signed upload or result CDN URLs.
- Store original files and referenced images in RustFS and rewrite Markdown image links before
  persisting; documents never depend on MinerU result URLs.
- For the MVP, wait for the result within the HTTP request under a configurable time budget. This is an
  explicit exception to durable background processing, limited to user-initiated, interactive uploads.
- Make the token optional at startup. Without it the service still boots and the upload endpoint reports
  the parser as unavailable for files that need MinerU.

## Consequences

- Uploaded file bytes are sent to a third-party cloud service. Content with data-residency constraints
  must not use this path until a self-hosted parser exists.
- Parsing quality and quotas depend on MinerU cloud availability, daily priority page quota and API
  stability; responses are validated at the boundary and failures map to stable error codes.
- A timed-out or interrupted request discards the MinerU result and its quota cost. There is no resumable
  parse state, retry or compensation for RustFS objects written before a later failure.
- Documents do not yet record which RustFS source file they came from; re-parsing or deduplication needs
  that link first.
- Each in-flight upload holds the source file and result archive in memory; concurrency is not limited yet.
- MinerU's license includes attribution terms for online services built on it; attribution must be
  reviewed before exposing upload parsing to third-party users.

## Follow-up

Before multi-user production use, replace the synchronous wait with a persistent parse task in PostgreSQL
(source object key, SHA-256 idempotency key, external batch ID, attempt history and error class) driven by
a RabbitMQ Consumer with bounded retries and a DLQ, in line with ADR-0007 and the backend scheduling rules.
The same task record links each document to its source file.

## Alternatives

- Per-format Node.js parsers: no external dependency, but high maintenance and weaker fidelity; rejected
  for the MVP.
- Self-hosted MinerU V1: keeps data in our infrastructure, but requires GPU or macOS-native hosting and a
  persistent task model because its job index is in-memory; deferred.
- MinerU cloud single-task API (`/api/v4/extract/task`): requires a publicly reachable file URL, which local
  RustFS is not; rejected.
- MinerU cloud lightweight Agent API: no token, but its 10 MB / 20-page limit is below the product limit and
  it returns no images; rejected.
