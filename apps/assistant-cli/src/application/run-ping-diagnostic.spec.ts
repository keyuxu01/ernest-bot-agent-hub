import { describe, expect, it, vi } from 'vitest';
import { runPingDiagnostic } from './run-ping-diagnostic';

const response = {
  status: 'ok' as const,
  service: 'assistant-runtime-service' as const,
  message: 'Runtime ready',
  mcpCollectionsUrl: 'https://mcp.example.test',
  correlationId: 'corr-command-test',
  version: '1.0.0',
  buildId: 'build-test',
};

describe('runPingDiagnostic', () => {
  it.each([true, false])('runs through the isTTY=%s command harness', async isTty => {
    const ping = vi.fn(async () => response);
    const lines: string[] = [];

    await runPingDiagnostic('https://runtime.example.test', {
      ping,
      writeLine: line => lines.push(line),
      isTty,
    });

    expect(ping).toHaveBeenCalledWith('https://runtime.example.test');
    expect(lines).toContain('correlation: corr-command-test');
    expect(lines[0]).toMatch(isTty ? /^✓ / : /^OK /);
  });
});
