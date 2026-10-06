import { Injectable, Logger } from '@nestjs/common';

type DiagnosticLog = {
  event: 'assistant.diagnostic.ping';
  correlationId: string;
  service: 'assistant-runtime-service';
  version: string;
  buildId: string;
};

@Injectable()
class StructuredDiagnosticLogger {
  private readonly logger = new Logger('AssistantDiagnostic');

  log(entry: DiagnosticLog): void {
    // 只记录白名单元数据；禁止将请求、凭证或提示词带入诊断日志。
    this.logger.log(JSON.stringify(entry));
  }
}

export type { DiagnosticLog };
export { StructuredDiagnosticLogger };
