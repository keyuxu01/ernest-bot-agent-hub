## Purpose

Let users upload a PDF, Office or plain-text file and receive a draft knowledge document whose body is Markdown, with the original file and extracted images kept in object storage.

## ADDED Requirements

### Requirement: Upload and parse endpoint

The service SHALL expose `POST /documents/upload/parse` accepting a `multipart/form-data` request with exactly one file in the `file` field and optional text fields `title`, `categoryId`, `teamId`, `authorId`, `tags`, `remark` and `createBy`. The request SHALL complete only after parsing and persistence have finished or failed.

#### Scenario: Supported file is parsed

- **WHEN** a client uploads a supported file within the size limit and parsing succeeds
- **THEN** the service responds `201` with a draft summary containing the document `id`, `title`, `status` (draft), `wordCount`, `contentLength`, `contentSummary`, the parser used, the number of stored images and the source file's name, type, size and URL

#### Scenario: File field is missing

- **WHEN** the request contains no `file` part
- **THEN** the service responds `400` with error code `DOCUMENT_FILE_REQUIRED`

#### Scenario: Unknown form field

- **WHEN** the request contains a text field outside the accepted metadata fields
- **THEN** the service responds `400` and creates no document

### Requirement: Supported file types and size limit

The service SHALL accept files whose extension is `pdf`, `docx`, `xlsx`, `pptx`, `txt` or `md` (case-insensitive) and whose size is at most 50 MB. It SHALL reject other files before storing or parsing them.

#### Scenario: Unsupported extension

- **WHEN** a client uploads a file with an unsupported extension such as `.exe` or `.doc`
- **THEN** the service responds `415` with error code `DOCUMENT_FILE_TYPE_UNSUPPORTED` and stores nothing

#### Scenario: File too large

- **WHEN** a client uploads a file larger than 50 MB
- **THEN** the service responds `413` with error code `DOCUMENT_FILE_TOO_LARGE` and stores nothing

#### Scenario: Non-ASCII file name

- **WHEN** a client uploads a file whose name contains Chinese characters
- **THEN** the default title and the returned source file name preserve those characters

### Requirement: Markdown conversion

The service SHALL produce the document body as Markdown. Plain text and Markdown files SHALL be read directly as UTF-8. PDF, DOCX, XLSX and PPTX files SHALL be converted in the service process. The summary's `parser` field SHALL name the engine that produced the body.

#### Scenario: Markdown file

- **WHEN** a client uploads a `.md` file
- **THEN** the document body equals the file's UTF-8 text (after newline normalization) and the summary reports the plain-text parser

#### Scenario: Office or PDF file

- **WHEN** a client uploads a `.pdf`, `.docx`, `.xlsx` or `.pptx` file
- **THEN** the document body is Markdown produced in-process and the summary reports the engine used (`pdf-parse`, `mammoth`, `exceljs`, `pptx-xml` or `officeparser`)

#### Scenario: Parsed content is empty

- **WHEN** conversion succeeds but yields only whitespace
- **THEN** the service responds `422` with error code `DOCUMENT_PARSE_EMPTY` and creates no document

### Requirement: Image extraction and link rewriting

The service SHALL store extracted images in the project's object storage and SHALL rewrite their Markdown references to object-storage URLs. The stored body SHALL NOT contain `data:` image URIs.

#### Scenario: Document with images

- **WHEN** conversion extracts images referenced by the Markdown
- **THEN** each extracted image is stored in object storage, each reference in the body points to its stored URL and the summary's image count equals the number of stored images

#### Scenario: Unsafe archive entry

- **WHEN** an Office ZIP contains an entry with an absolute path or a `..` segment
- **THEN** that entry is ignored and never stored

### Requirement: Source file and draft persistence

The service SHALL convert the file before writing object storage. After a successful conversion it SHALL store the original file in object storage and SHALL create the document as a draft through the existing metadata and content stores without changing their record shape. The source file's object URL, name, type and size SHALL be returned in the upload response only; persisting the link between a document and its source file is out of scope. When no title is supplied, the title SHALL be the file name without its extension.

#### Scenario: Default title

- **WHEN** a client uploads `季度报告.pdf` without a `title` field
- **THEN** the created draft's title is `季度报告`

#### Scenario: Draft visible through existing APIs

- **WHEN** an upload succeeds
- **THEN** `GET /documents/:id` returns the draft with the parsed Markdown body

### Requirement: Parser failure reporting

The service SHALL map conversion failures to stable error codes without exposing credentials, internal stack traces or parser library messages.

#### Scenario: Converter throws

- **WHEN** in-process conversion throws
- **THEN** the service responds `422` with error code `DOCUMENT_PARSE_FAILED`, stores nothing and creates no document
