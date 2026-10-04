import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RabbitmqModule } from '../../infrastructure/rabbitmq/rabbitmq.module';
import { RabbitMqHealthIndicator } from '../../infrastructure/rabbitmq/rabbitmq.health-indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, RabbitmqModule],
  controllers: [HealthController],
  providers: [RabbitMqHealthIndicator],
})
class HealthModule {}

export { HealthModule };
