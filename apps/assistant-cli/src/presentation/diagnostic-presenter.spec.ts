import { describe, expect, it } from 'vitest';
import { presentPing } from './diagnostic-presenter';

const response = {
  status: 'ok' as const,
  service: 'assistant-runtime-service' as const,
  message: 'Runtime ready',
  mcpCollectionsUrl: 'https://mcp.example.test',
  correlationId: 'corr-cli-test',
  version: '1.0.0',
  buildId: 'build-test',
};

describe('diagnostic presenter', () => {
  it.each([
    [true, 'interactive'],
    [false, 'plain'],
  ] as const)('renders the diagnostic in isTTY=%s mode', (isTty, expectedMode) => {
    const presentation = presentPing(
      response,
      'https://runtime.example.test',
      isTty,
    );

    expect(presentation.mode).toBe(expectedMode);
    expect(presentation.lines).toContain('correlation: corr-cli-test');
    expect(presentation.lines).toContain('build: 1.0.0 (build-test)');
  });
});
