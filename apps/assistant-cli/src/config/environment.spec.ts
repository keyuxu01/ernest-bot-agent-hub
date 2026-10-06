import { describe, expect, it } from 'vitest';
import { validateCliEnvironment } from './environment';

const completeEnvironment = {
  NODE_ENV: 'development',
  USER_PLATFORM_URL: 'http://localhost:9040',
  ASSISTANT_RUNTIME_URL: 'http://localhost:9030',
  OAUTH_CALLBACK_PORT: '49152',
  CREDENTIAL_STORE_SERVICE: 'agent-hub-assistant',
  CREDENTIAL_STORE_ACCOUNT: 'default',
  CLI_REQUEST_TIMEOUT_MS: '30000',
  LOCAL_TOOL_TIMEOUT_MS: '120000',
  LOCAL_TOOL_MAX_OUTPUT_BYTES: '1048576',
  CLI_VERSION: '1.0.0-test',
  CLI_BUILD_ID: 'build-test',
};

describe('assistant CLI environment', () => {
  it('normalizes the local development client configuration', () => {
    expect(validateCliEnvironment(completeEnvironment)).toMatchObject({
      userPlatformUrl: 'http://localhost:9040',
      assistantRuntimeUrl: 'http://localhost:9030',
      oauthCallbackPort: 49152,
      buildId: 'build-test',
    });
  });

  it.each([
    'USER_PLATFORM_URL',
    'ASSISTANT_RUNTIME_URL',
    'OAUTH_CALLBACK_PORT',
    'CREDENTIAL_STORE_SERVICE',
    'CREDENTIAL_STORE_ACCOUNT',
    'CLI_REQUEST_TIMEOUT_MS',
    'LOCAL_TOOL_TIMEOUT_MS',
    'LOCAL_TOOL_MAX_OUTPUT_BYTES',
    'CLI_VERSION',
    'CLI_BUILD_ID',
  ])('rejects missing setting %s', key => {
    const input: Record<string, unknown> = { ...completeEnvironment };
    delete input[key];
    expect(() => validateCliEnvironment(input)).toThrow(`Environment variable ${key}`);
  });

  it.each(['USER_PLATFORM_URL', 'ASSISTANT_RUNTIME_URL'])(
    'rejects cleartext endpoint %s in production before credentials are sent',
    key => {
      const productionEnvironment = {
        ...completeEnvironment,
        NODE_ENV: 'production',
        USER_PLATFORM_URL: 'https://identity.example.test',
        ASSISTANT_RUNTIME_URL: 'https://runtime.example.test',
      };
      expect(() =>
        validateCliEnvironment({
          ...productionEnvironment,
          [key]: 'http://localhost',
        }),
      ).toThrow(`${key} must use HTTPS`);
    },
  );

  it.each(['USER_PLATFORM_URL', 'ASSISTANT_RUNTIME_URL'])(
    'rejects non-loopback cleartext endpoint %s during development',
    key => {
      expect(() =>
        validateCliEnvironment({
          ...completeEnvironment,
          [key]: 'http://192.168.1.10:9030',
        }),
      ).toThrow(`${key} must use HTTPS`);
    },
  );
});
