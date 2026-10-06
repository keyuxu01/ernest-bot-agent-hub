import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CorrelationContext } from '../../infrastructure/observability/correlation-context';
import { CorrelationMiddleware } from '../../infrastructure/observability/correlation.middleware';
import { StructuredDiagnosticLogger } from '../../infrastructure/observability/structured-diagnostic-logger';
import { GetAssistantDiagnostic } from './application/get-assistant-diagnostic';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    GetAssistantDiagnostic,
    CorrelationContext,
    CorrelationMiddleware,
    StructuredDiagnosticLogger,
  ],
})
class AssistantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes(AssistantController);
  }
}

export { AssistantModule };
