import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDocumentDto } from '../dto/query-document.dto';
import { DocumentEntity } from '../entities/document.entity';
import { CreateDocumentMetaInput } from '../type/create-document-meta.input';

/**
 * PostgreSQL `kh_document` 数据访问
 *
 * 职责：封装元数据表的查询与持久化细节（软删过滤、分页筛选、列名）。
 * 不包含业务规则（双写顺序、发布状态机等由 DocumentService 负责）。
 */
@Injectable()
export class DocumentRepository {
  constructor(
    /** TypeORM 实体仓库，对应表 `kh_document` */
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
  ) {}

  /**
   * 写入一条文档元数据
   * `repo.create` 只做实体装配，真正落库靠 `save`
   */
  async create(input: CreateDocumentMetaInput): Promise<DocumentEntity> {
    const doc = this.repo.create(input);
    return this.repo.save(doc);
  }

  /**
   * 持久化已加载的实体（更新场景：Service 改字段后调用）
   */
  async save(doc: DocumentEntity): Promise<DocumentEntity> {
    return this.repo.save(doc);
  }

  /**
   * 按雪花 ID 查未软删的元数据
   * 所有「读单篇」入口统一走这里，避免漏掉 `deleted = false`
   */
  async findActiveById(id: string): Promise<DocumentEntity | null> {
    return this.repo.findOne({ where: { id, deleted: false } });
  }

  /**
   * 分页列表（仅元数据，不含 Mongo 正文）
   * - 默认排除软删
   * - 标题 ILIKE 模糊；分类 / 团队 / 作者 / 状态可选筛选
   * - `status` 为 0（Draft）时也要能筛，故用 `!== undefined`
   */
  async findPage(query: QueryDocumentDto): Promise<{
    items: DocumentEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // 默认排除已软删记录
    const qb = this.repo
      .createQueryBuilder('doc')
      .where('doc.deleted = :deleted', { deleted: false });

    // 标题模糊匹配（不区分大小写）
    if (query.title) {
      qb.andWhere('doc.title ILIKE :title', { title: `%${query.title}%` });
    }
    if (query.categoryId) {
      qb.andWhere('doc.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.teamId) {
      qb.andWhere('doc.team_id = :teamId', { teamId: query.teamId });
    }
    if (query.authorId) {
      qb.andWhere('doc.author_id = :authorId', { authorId: query.authorId });
    }
    // status 为 0（Draft）时也要能筛，故用 !== undefined
    if (query.status !== undefined) {
      qb.andWhere('doc.status = :status', { status: query.status });
    }

    // 按创建时间倒序，再分页（skip/take 对应 page / pageSize）
    qb.orderBy('doc.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, pageSize };
  }
}
