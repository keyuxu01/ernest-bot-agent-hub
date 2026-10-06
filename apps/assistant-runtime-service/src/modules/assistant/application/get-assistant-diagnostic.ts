import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssistantRuntimePingResponseSchema,
  type AssistantRuntimePingResponse,
} from '@repo/contracts';
import { CorrelationContext } from '../../../infrastructure/observability/correlation-context';
import { StructuredDiagnosticLogger } from '../../../infrastructure/observability/structured-diagnostic-logger';
import { ASSISTANT_DIAGNOSTIC_MESSAGE } from '../domain/assistant-diagnostic';

@Injectable()
class GetAssistantDiagnostic {
  constructor(
    private readonly config: ConfigService,
    private readonly correlation: CorrelationContext,
    private readonly logger: StructuredDiagnosticLogger,
  ) {}

  execute(): AssistantRuntimePingResponse {
    const correlationId = this.correlation.getCorrelationId();
    const version = this.config.get<string>('SERVICE_VERSION') ?? 'development';
    const buildId = this.config.get<string>('SERVICE_BUILD_ID') ?? 'local';
    const response = AssistantRuntimePingResponseSchema.parse({
      status: 'ok',
      service: 'assistant-runtime-service',
      message: ASSISTANT_DIAGNOSTIC_MESSAGE,
      mcpCollectionsUrl:
        this.config.get<string>('MCP_COLLECTIONS_URL')?.trim() || null,
      correlationId,
      version,
      buildId,
    });

    this.logger.log({
      event: 'assistant.diagnostic.ping',
      correlationId,
      service: 'assistant-runtime-service',
      version,
      buildId,
    });
    return response;
  }
}

export { GetAssistantDiagnostic };
