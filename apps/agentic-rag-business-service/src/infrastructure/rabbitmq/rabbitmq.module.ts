import { Module } from '@nestjs/common';
import { DocumentPipelinePublisher } from './document-pipeline.publisher';
import { RabbitMqService } from './rabbitmq.service';

/** RabbitMQ 连接与发布适配 */
@Module({
  providers: [RabbitMqService, DocumentPipelinePublisher],
  exports: [RabbitMqService, DocumentPipelinePublisher],
})
class RabbitmqModule {}

export { RabbitmqModule };
