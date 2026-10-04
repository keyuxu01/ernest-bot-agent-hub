import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RabbitMqService } from './rabbitmq.service';

/**
 * RabbitMQ readiness：连接 + 至少一名消费者已注册。
 */
@Injectable()
class RabbitMqHealthIndicator {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly indicator: HealthIndicatorService,
  ) {}

  isHealthy(key: string) {
    const check = this.indicator.check(key);
    const details = {
      consumers: this.rabbit.registeredHandlerCount,
    };

    return this.rabbit.isReady() ? check.up(details) : check.down(details);
  }
}

export { RabbitMqHealthIndicator };
