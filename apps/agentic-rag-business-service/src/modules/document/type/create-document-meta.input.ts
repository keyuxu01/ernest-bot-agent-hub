import { DocumentEntity } from '../entities/document.entity';

/** 创建 Postgres 文档元数据时的必填 / 可选字段 */
export type CreateDocumentMetaInput = Pick<
  DocumentEntity,
  | 'id'
  | 'title'
  | 'contentId'
  | 'status'
  | 'wordCount'
  | 'isPublic'
  | 'deleted'
> &
  Partial<
    Pick<
      DocumentEntity,
      | 'summary'
      | 'categoryId'
      | 'teamId'
      | 'authorId'
      | 'coverImage'
      | 'tags'
      | 'remark'
      | 'publishTime'
      | 'createBy'
      | 'updateBy'
    >
  >;
