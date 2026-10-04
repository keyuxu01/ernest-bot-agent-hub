# ADR-0015: Parse Uploaded Documents In-Process

- Status: Accepted
- Date: 2026-10-04
- Supersedes: [ADR-0014](./0014-use-mineru-cloud-for-document-parsing.md)

## Context

`POST /documents/upload/parse` must turn PDF, DOCX, XLSX, PPTX, TXT and Markdown into a Markdown
draft. ADR-0014 chose the MinerU cloud precise API so one vendor handled layout, tables and images.

That path is not usable from the environments we develop and deploy in today: MinerU's pre-signed
upload and result CDN live on mainland China object storage. From an overseas egress (VPN exit or a
Railway region) the TLS handshake to those hosts is reset, while `mineru.net` itself stays reachable.
Self-hosted MinerU still needs GPU infrastructure we do not have.

The earlier knowledge-hub implementation already parsed each format inside NestJS
(`pdf-parse`, `mammoth` + `turndown`, `exceljs`, OOXML for PPTX, `officeparser` as fallback).

## Decision

- Read TXT and Markdown as UTF-8 in the request process.
- Convert PDF, DOCX, XLSX and PPTX with in-process parsers. DOCX / XLSX / PPTX fall back to
  `officeparser` when the primary parser throws or yields empty Markdown.
- Extract images in the parser (local Markdown references) and upload them to RustFS before persist.
  Mammoth must not emit `data:` URIs into the stored body.
- Keep conversion in `modules/document/helpers`. Orchestration stays in `DocumentParseService`.
- Do not call MinerU and do not keep a MinerU client in this service.
- Wait for conversion inside the HTTP request. This remains an MVP exception to durable background
  jobs, limited to user-initiated uploads.

## Consequences

- File bytes never leave project infrastructure for parsing.
- Fidelity is weaker than a layout-aware model, especially for scanned PDFs and complex Office files.
- Each in-flight request holds the source file and extracted images in memory; concurrency is not
  limited yet.
- `officeparser` 8.x is a large dependency and may pull optional native/OCR paths; fallback calls
  disable attachment extraction so base64 images are not written to Mongo.
- Documents still do not record which RustFS source file they came from.

## Follow-up

A persistent parse task (source object key, SHA-256, attempt history) driven by a RabbitMQ Consumer
remains the path to multi-user production, in line with ADR-0007. Self-hosted MinerU can replace
the in-process parsers later without changing document persistence.

## Alternatives

- MinerU cloud precise API: rejected because upload/result storage is unreachable from overseas
  egress; see superseded ADR-0014.
- Self-hosted MinerU V1: keeps data in our infrastructure, but needs GPU hosting; deferred.
- Per-format parsers without an `officeparser` fallback: simpler dependency graph, but more brittle
  on damaged Office files; rejected.
