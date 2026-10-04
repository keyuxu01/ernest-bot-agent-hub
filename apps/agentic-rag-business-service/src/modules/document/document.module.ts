import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RabbitmqModule } from '../../infrastructure/rabbitmq/rabbitmq.module';
import { RustfsModule } from '../../infrastructure/rustfs/rustfs.module';
import { DocumentParseService } from './document-parse.service';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentContentRepository } from './repository/document-content.repository';
import { DocumentRepository } from './repository/document.repository';
import { DocumentEntity } from './entities/document.entity';
import {
  DocumentContent,
  DocumentContentSchema,
} from './schemas/document-content.schema';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity]),
    MongooseModule.forFeature([
      { name: DocumentContent.name, schema: DocumentContentSchema },
    ]),
    RustfsModule,
    RabbitmqModule,
  ],
  controllers: [DocumentController],
  providers: [
    DocumentRepository,
    DocumentContentRepository,
    DocumentService,
    DocumentParseService,
  ],
  exports: [
    DocumentService,
    DocumentRepository,
    DocumentContentRepository,
  ],
})
export class DocumentModule {}
