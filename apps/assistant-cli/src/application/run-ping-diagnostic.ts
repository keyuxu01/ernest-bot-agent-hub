import type { AssistantRuntimePingResponse } from '@repo/contracts';
import { presentPing } from '../presentation/diagnostic-presenter';

type PingRuntime = (baseUrl: string) => Promise<AssistantRuntimePingResponse>;

type RunPingDiagnosticDependencies = {
  ping: PingRuntime;
  writeLine: (line: string) => void;
  isTty: boolean;
};

/** 可测试的诊断命令，不直接读取全局终端或网络。 */
const runPingDiagnostic = async (
  baseUrl: string,
  dependencies: RunPingDiagnosticDependencies,
): Promise<void> => {
  const result = await dependencies.ping(baseUrl);
  const presentation = presentPing(result, baseUrl, dependencies.isTty);
  for (const line of presentation.lines) dependencies.writeLine(line);
};

export type { PingRuntime, RunPingDiagnosticDependencies };
export { runPingDiagnostic };
