import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { CorrelationContext } from '../../../infrastructure/observability/correlation-context';
import type { StructuredDiagnosticLogger } from '../../../infrastructure/observability/structured-diagnostic-logger';
import { GetAssistantDiagnostic } from './get-assistant-diagnostic';

describe('GetAssistantDiagnostic', () => {
  it('propagates one correlation ID through response and structured log', () => {
    const log = vi.fn();
    const useCase = new GetAssistantDiagnostic(
      {
        get: (key: string) =>
          ({
            MCP_COLLECTIONS_URL: 'https://mcp.example.test',
            SERVICE_VERSION: '1.2.3',
            SERVICE_BUILD_ID: 'build-abc',
          })[key],
      } as ConfigService,
      { getCorrelationId: () => 'corr-shared-123' } as CorrelationContext,
      { log } as unknown as StructuredDiagnosticLogger,
    );

    const response = useCase.execute();

    expect(response.correlationId).toBe('corr-shared-123');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: response.correlationId }),
    );
    expect(response).toMatchObject({ version: '1.2.3', buildId: 'build-abc' });
  });
});
