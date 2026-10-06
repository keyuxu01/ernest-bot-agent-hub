import { Global, Module } from '@nestjs/common';
import { CorrelationContext } from './correlation-context';
import { CorrelationMiddleware } from './correlation.middleware';

@Global()
@Module({
  providers: [CorrelationContext, CorrelationMiddleware],
  exports: [CorrelationContext, CorrelationMiddleware],
})
class ObservabilityModule {}

export { ObservabilityModule };
