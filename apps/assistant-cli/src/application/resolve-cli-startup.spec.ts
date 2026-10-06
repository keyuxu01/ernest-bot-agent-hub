import { describe, expect, it } from 'vitest';
import { resolveCliStartup } from './resolve-cli-startup';

const completeEnvironment = {
  USER_PLATFORM_URL: 'https://identity.example.test',
  ASSISTANT_RUNTIME_URL: 'https://runtime.example.test',
  OAUTH_CALLBACK_PORT: '49152',
  CREDENTIAL_STORE_SERVICE: 'agent-hub-assistant',
  CREDENTIAL_STORE_ACCOUNT: 'default',
  CLI_REQUEST_TIMEOUT_MS: '30000',
  LOCAL_TOOL_TIMEOUT_MS: '120000',
  LOCAL_TOOL_MAX_OUTPUT_BYTES: '1048576',
  CLI_VERSION: '1.0.0-test',
  CLI_BUILD_ID: 'build-test',
};

describe('resolveCliStartup', () => {
  it('uses the validated Runtime endpoint', () => {
    expect(resolveCliStartup(completeEnvironment).runtimeBaseUrl).toBe(
      'https://runtime.example.test',
    );
  });

  it('rejects a missing required setting through the real startup gate', () => {
    const incomplete: Record<string, unknown> = { ...completeEnvironment };
    delete incomplete.CREDENTIAL_STORE_SERVICE;

    expect(() => resolveCliStartup(incomplete)).toThrow(
      'Environment variable CREDENTIAL_STORE_SERVICE is required',
    );
  });

  it('rejects a cleartext command override before transport execution', () => {
    expect(() =>
      resolveCliStartup(completeEnvironment, 'http://runtime.example.test'),
    ).toThrow('must use HTTPS');
  });
});
