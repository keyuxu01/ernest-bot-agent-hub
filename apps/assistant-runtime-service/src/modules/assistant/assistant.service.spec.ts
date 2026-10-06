import { describe, expect, it, vi } from 'vitest';
import type { GetAssistantDiagnostic } from './application/get-assistant-diagnostic';
import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  it('preserves the validated ping diagnostic through the application boundary', () => {
    const response = {
      status: 'ok' as const,
      service: 'assistant-runtime-service' as const,
      message: 'Assistant runtime is up. Tools will mount via MCP.',
      mcpCollectionsUrl: 'https://mcp.example.test',
      correlationId: 'corr-test',
      version: '1.0.0-test',
      buildId: 'build-test',
    };
    const execute = vi.fn(() => response);
    const service = new AssistantService({ execute } as unknown as GetAssistantDiagnostic);

    expect(service.ping()).toEqual(response);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('emits SSE-shaped stub chunks for stream', () => {
    const service = new AssistantService({} as GetAssistantDiagnostic);
    const chunks = service.streamStubChunks('hello');

    expect(chunks.some(chunk => chunk.includes('Echo from assistant runtime'))).toBe(
      true,
    );
    expect(chunks.at(-1)).toContain('"phase":"completed"');
  });
});
