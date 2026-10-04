import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RustfsService } from '../../infrastructure/rustfs/rustfs.service';
import type { UploadBytesOptions } from '../../infrastructure/rustfs/type/upload-bytes.options';
import { DocumentParseService } from './document-parse.service';
import type { DocumentService } from './document.service';
import { DocumentStatus } from './entities/document.entity';
import type { ConvertedDocument } from './type/document-convert.types';
import type { UploadedDocumentFile } from './type/document-upload.types';

const { convertDocument } = vi.hoisted(() => ({
  convertDocument:
    vi.fn<(fileType: string, bytes: Buffer) => Promise<ConvertedDocument>>(),
}));

vi.mock('./helpers/convert-document', () => ({ convertDocument }));

function upload(name: string, content: string | Uint8Array, mimetype = '') {
  const buffer = Buffer.from(content);
  return {
    originalname: name,
    mimetype,
    size: buffer.length,
    buffer,
  } satisfies UploadedDocumentFile;
}

async function errorBody(promise: Promise<unknown>) {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(HttpException);
  return {
    status: (error as HttpException).getStatus(),
    body: (error as HttpException).getResponse() as { code: string },
  };
}

function converted(
  overrides: Partial<ConvertedDocument> = {},
): ConvertedDocument {
  return {
    markdown: '# 笔记\n\n正文',
    images: new Map(),
    parser: 'plain-text',
    ...overrides,
  };
}

describe('DocumentParseService', () => {
  const uploadBytes =
    vi.fn<
      (
        bytes: Buffer | Uint8Array,
        options: UploadBytesOptions,
      ) => Promise<string>
    >();
  const create = vi.fn();
  let service: DocumentParseService;

  beforeEach(() => {
    vi.resetAllMocks();
    let counter = 0;
    uploadBytes.mockImplementation((_bytes, options) =>
      Promise.resolve(
        `http://rustfs/${options.prefix}/${++counter}-${options.fileName}`,
      ),
    );
    create.mockImplementation((dto: { title: string; content: string }) =>
      Promise.resolve({
        id: '42',
        title: dto.title,
        status: DocumentStatus.Draft,
        wordCount: 7,
        createdAt: new Date('2026-10-04T00:00:00Z'),
        content: dto.content,
      }),
    );
    convertDocument.mockResolvedValue(converted());

    service = new DocumentParseService(
      { create } as unknown as DocumentService,
      { uploadBytes } as unknown as RustfsService,
    );
  });

  it('reads Markdown after conversion and stores the original file', async () => {
    convertDocument.mockResolvedValue(
      converted({ markdown: '# 笔记\n\n正文', parser: 'plain-text' }),
    );

    const result = await service.uploadAndParse(
      upload('notes.md', '\ufeff# 笔记\n\n正文', 'text/markdown'),
      {},
    );

    expect(convertDocument).toHaveBeenCalledWith('md', expect.any(Buffer));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'notes',
        content: '# 笔记\n\n正文',
        status: DocumentStatus.Draft,
      }),
    );
    expect(result).toMatchObject({
      id: '42',
      parser: 'plain-text',
      imageCount: 0,
      source: {
        fileName: 'notes.md',
        fileType: 'md',
        url: 'http://rustfs/documents/sources/1-notes.md',
      },
    });
  });

  it('uploads extracted images and rewrites local references', async () => {
    convertDocument.mockResolvedValue(
      converted({
        markdown:
          '# 报告\n\n![](images/d0.jpg)\n\n![](images/d0.jpg)\n\n![](images/missing.jpg)',
        parser: 'mammoth',
        images: new Map([
          [
            'images/d0.jpg',
            {
              bytes: new Uint8Array([1, 2, 3]),
              contentType: 'image/jpeg',
              fileName: 'docx_0.jpg',
            },
          ],
        ]),
      }),
    );

    const result = await service.uploadAndParse(
      upload('季度报告.docx', 'docx-bytes'),
      { title: '  自定义标题 ' },
    );

    expect(uploadBytes).toHaveBeenCalledTimes(2);
    expect(uploadBytes).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]), {
      fileName: 'docx_0.jpg',
      contentType: 'image/jpeg',
      prefix: 'documents/images',
    });

    const [dto] = create.mock.calls[0] ?? [];
    expect(dto.title).toBe('自定义标题');
    expect(dto.content).toBe(
      '# 报告\n\n![](http://rustfs/documents/images/2-docx_0.jpg)\n\n![](http://rustfs/documents/images/2-docx_0.jpg)\n\n![](images/missing.jpg)',
    );
    expect(result).toMatchObject({
      parser: 'mammoth',
      imageCount: 1,
      source: { fileType: 'docx' },
    });
  });

  it.each([
    ['季度报告.txt', undefined, '季度报告'],
    ['.txt', undefined, '未命名文档'],
    ['a.txt', '   ', 'a'],
  ])('derives title for %s', async (fileName, title, expected) => {
    await service.uploadAndParse(upload(fileName, 'hello'), { title });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ title: expected }),
    );
  });

  it.each([undefined, { originalname: 'a.txt' }])(
    'requires a valid file (%o)',
    async (uploaded) => {
      expect(await errorBody(service.uploadAndParse(uploaded, {}))).toEqual({
        status: 400,
        body: expect.objectContaining({ code: 'DOCUMENT_FILE_REQUIRED' }),
      });
    },
  );

  it('rejects unsupported types before storing or converting', async () => {
    expect(
      await errorBody(service.uploadAndParse(upload('legacy.doc', 'x'), {})),
    ).toEqual({
      status: 415,
      body: expect.objectContaining({ code: 'DOCUMENT_FILE_TYPE_UNSUPPORTED' }),
    });
    expect(convertDocument).not.toHaveBeenCalled();
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it('rejects empty parse results without storing or creating', async () => {
    convertDocument.mockResolvedValue(converted({ markdown: ' \n\t' }));

    expect(
      await errorBody(service.uploadAndParse(upload('blank.txt', 'x'), {})),
    ).toEqual({
      status: 422,
      body: expect.objectContaining({ code: 'DOCUMENT_PARSE_EMPTY' }),
    });
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('maps converter exceptions to DOCUMENT_PARSE_FAILED without leaking details', async () => {
    convertDocument.mockRejectedValue(new Error('exceljs internal boom'));

    const { status, body } = await errorBody(
      service.uploadAndParse(upload('a.xlsx', 'x'), {}),
    );

    expect(status).toBe(422);
    expect(body.code).toBe('DOCUMENT_PARSE_FAILED');
    expect(JSON.stringify(body)).not.toContain('exceljs');
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
