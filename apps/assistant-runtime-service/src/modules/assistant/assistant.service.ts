import { Injectable } from '@nestjs/common';
import type { AssistantRuntimePingResponse } from '@repo/contracts';
import { GetAssistantDiagnostic } from './application/get-assistant-diagnostic';
import { createDiagnosticStreamChunks } from './domain/assistant-diagnostic';

@Injectable()
class AssistantService {
  constructor(private readonly getDiagnostic: GetAssistantDiagnostic) {}

  ping(): AssistantRuntimePingResponse {
    return this.getDiagnostic.execute();
  }

  /** 兼容原诊断流；真实模型与工具循环属于后续任务。 */
  streamStubChunks(prompt: string): string[] {
    return createDiagnosticStreamChunks(prompt);
  }
}

export { AssistantService };
