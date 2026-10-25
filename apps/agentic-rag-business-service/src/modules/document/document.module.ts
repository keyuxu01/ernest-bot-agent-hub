import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RabbitmqModule } from '../../infrastructure/rabbitmq/rabbitmq.module';
import { RustfsModule } from '../../infrastructure/rustfs/rustfs.module';
import { DocumentIndexSyncService } from './document-index-sync.service';
import { DocumentParseService } from './document-parse.service';
import { DocumentReviewController } from './document-review.controller';
import { DocumentReviewService } from './document-review.service';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentContentRepository } from './repository/document-content.repository';
import { DocumentReviewRepository } from './repository/document-review.repository';
import { DocumentRepository } from './repository/document.repository';
import { DocumentReviewEntity } from './entities/document-review.entity';
import { DocumentEntity } from './entities/document.entity';
import {
  DocumentContent,
  DocumentContentSchema,
} from './schemas/document-content.schema';

/**
 * 文档模块
 * - DocumentService：CRUD 与状态流转（草稿 / 发布 / 归档 / 存草稿）
 * - DocumentReviewService：发布审核（提交 / 通过 / 驳回）
 * - DocumentIndexSyncService：进入 / 离开 Published 时投递索引命令
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, DocumentReviewEntity]),
    MongooseModule.forFeature([
      { name: DocumentContent.name, schema: DocumentContentSchema },
    ]),
    RustfsModule,
    RabbitmqModule,
  ],
  controllers: [DocumentController, DocumentReviewController],
  providers: [
    DocumentRepository,
    DocumentContentRepository,
    DocumentReviewRepository,
    DocumentIndexSyncService,
    DocumentReviewService,
    DocumentService,
    DocumentParseService,
  ],
  exports: [DocumentService, DocumentRepository, DocumentContentRepository],
})
export class DocumentModule {}
