import {
  AssistantRuntimePingResponseSchema,
  type AssistantRuntimePingResponse,
} from '@repo/contracts';
import { randomUUID } from 'node:crypto';

const DEFAULT_RUNTIME_URL = 'http://localhost:9030';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

type RuntimeRequestMetadata = {
  correlationId: string;
  version: string;
  buildId: string;
};

const createRuntimeRequestMetadata = (): RuntimeRequestMetadata => ({
  correlationId: randomUUID(),
  version: process.env.CLI_VERSION?.trim() || 'development',
  buildId: process.env.CLI_BUILD_ID?.trim() || 'local',
});

const resolveRuntimeBaseUrl = (override?: string): string => {
  const fromEnv = process.env.ASSISTANT_RUNTIME_URL?.trim();
  const candidate = override?.trim() || fromEnv || DEFAULT_RUNTIME_URL;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Assistant Runtime URL must be a valid URL');
  }

  // Monorepo 开发直接连接 localhost；生产和非本地地址仍禁止明文传输。
  const nodeEnvironment = process.env.NODE_ENV?.trim() || 'development';
  const isLocalDevelopment =
    nodeEnvironment === 'development' || nodeEnvironment === 'test';
  const isLoopbackHttp =
    parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLocalDevelopment && isLoopbackHttp)) {
    throw new Error(
      'Assistant Runtime URL must use HTTPS, except HTTP localhost in development or test; credentials and commands were not sent',
    );
  }
  return candidate.replace(/\/$/, '');
};

const requestHeaders = (metadata: RuntimeRequestMetadata): HeadersInit => ({
  'x-correlation-id': metadata.correlationId,
  'x-client-version': metadata.version,
  'x-client-build-id': metadata.buildId,
});

const pingRuntime = async (
  baseUrl?: string,
  metadata = createRuntimeRequestMetadata(),
): Promise<AssistantRuntimePingResponse> => {
  const url = `${resolveRuntimeBaseUrl(baseUrl)}/assistant/ping`;
  const response = await fetch(url, { headers: requestHeaders(metadata) });
  if (!response.ok) {
    throw new Error(`Ping failed: HTTP ${response.status} ${response.statusText}`);
  }
  const body: unknown = await response.json();
  const parsed = AssistantRuntimePingResponseSchema.parse(body);
  if (parsed.correlationId !== metadata.correlationId) {
    throw new Error('Ping failed: Runtime returned a different correlation ID');
  }
  return parsed;
};

const streamRuntime = async (
  prompt: string,
  baseUrl?: string,
  onChunk?: (chunk: string) => void,
  metadata = createRuntimeRequestMetadata(),
): Promise<string> => {
  const url = new URL(`${resolveRuntimeBaseUrl(baseUrl)}/assistant/stream`);
  url.searchParams.set('prompt', prompt);
  const response = await fetch(url, { headers: requestHeaders(metadata) });
  if (!response.ok) {
    throw new Error(`Stream failed: HTTP ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Stream failed: response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    full += text;
    onChunk?.(text);
  }
  full += decoder.decode();
  return full;
};

export {
  DEFAULT_RUNTIME_URL,
  createRuntimeRequestMetadata,
  pingRuntime,
  resolveRuntimeBaseUrl,
  streamRuntime,
};
export type { RuntimeRequestMetadata };
