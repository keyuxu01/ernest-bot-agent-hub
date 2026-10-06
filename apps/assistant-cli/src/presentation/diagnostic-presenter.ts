import type { AssistantRuntimePingResponse } from '@repo/contracts';

type DiagnosticPresentation = {
  lines: string[];
  mode: 'interactive' | 'plain';
};

/** Ink 接入前的薄展示层：TTY 与非 TTY 共享内容，只改变装饰。 */
const presentPing = (
  result: AssistantRuntimePingResponse,
  runtimeUrl: string,
  isTty: boolean,
): DiagnosticPresentation => {
  const marker = isTty ? '✓' : 'OK';
  return {
    mode: isTty ? 'interactive' : 'plain',
    lines: [
      `${marker} ${result.message}`,
      `service: ${result.service}`,
      `runtime: ${runtimeUrl}`,
      `mcp: ${result.mcpCollectionsUrl ?? '(not configured)'}`,
      `correlation: ${result.correlationId}`,
      `build: ${result.version} (${result.buildId})`,
    ],
  };
};

export type { DiagnosticPresentation };
export { presentPing };
