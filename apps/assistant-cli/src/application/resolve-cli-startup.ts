import {
  validateCliEnvironment,
  type AssistantCliEnvironment,
} from '../config/environment';
import { resolveRuntimeBaseUrl } from '../transport/runtime-client';

type CliStartup = {
  environment: AssistantCliEnvironment;
  runtimeBaseUrl: string;
};

/**
 * 所有真实 CLI 命令先经过同一个启动门。这样配置 schema 不是孤立工具函数，
 * 缺失凭证库、网络、版本或本地能力限制时会在发送请求前失败。
 */
const resolveCliStartup = (
  input: Record<string, unknown>,
  runtimeOverride?: string,
): CliStartup => {
  const environment = validateCliEnvironment(input);
  return {
    environment,
    runtimeBaseUrl: resolveRuntimeBaseUrl(
      runtimeOverride ?? environment.assistantRuntimeUrl,
    ),
  };
};

export type { CliStartup };
export { resolveCliStartup };
