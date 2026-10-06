import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CorrelationContext } from './correlation-context';

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

@Injectable()
class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly context: CorrelationContext) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header('x-correlation-id')?.trim();
    const correlationId =
      supplied !== undefined && CORRELATION_ID_PATTERN.test(supplied)
        ? supplied
        : randomUUID();

    response.setHeader('x-correlation-id', correlationId);
    this.context.run(correlationId, next);
  }
}

export { CorrelationMiddleware };
