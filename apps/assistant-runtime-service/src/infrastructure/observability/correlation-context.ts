import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type CorrelationState = { correlationId: string };

@Injectable()
class CorrelationContext {
  private readonly storage = new AsyncLocalStorage<CorrelationState>();

  run<T>(correlationId: string, callback: () => T): T {
    return this.storage.run({ correlationId }, callback);
  }

  getCorrelationId(): string {
    return this.storage.getStore()?.correlationId ?? 'unscoped';
  }
}

export { CorrelationContext };
