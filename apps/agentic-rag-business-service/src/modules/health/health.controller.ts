import { Controller, Get, Header } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  SharedHealthProbeResponseSchema,
  SharedServiceIdentityResponseSchema,
  type SharedHealthProbeResponse,
  type SharedServiceIdentityResponse,
} from '@repo/contracts';
import { RabbitMqHealthIndicator } from '../../infrastructure/rabbitmq/rabbitmq.health-indicator';
import { Public } from '../auth/decorators/public.decorator';
import {
  BUSINESS_SERVICE_NAME,
  LOCAL_INSTANCE_ID,
  UNKNOWN_SERVICE_VERSION,
} from './health.constants';

const getNonEmptyEnvironmentValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value === '' ? undefined : value;
};

/** 探针必须免登录：平台 liveness / readiness 不带 token */
@Public()
@Controller('health')
class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly rabbitHealth: RabbitMqHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  async getLiveness(): Promise<SharedHealthProbeResponse> {
    const result = await this.healthCheckService.check([]);

    return SharedHealthProbeResponseSchema.parse(result);
  }

  @Get('ready')
  @HealthCheck()
  async getReadiness(): Promise<SharedHealthProbeResponse> {
    const result = await this.healthCheckService.check([
      () => this.rabbitHealth.isHealthy('rabbitmq'),
    ]);

    return SharedHealthProbeResponseSchema.parse(result);
  }

  @Get('whoami')
  @Header('Cache-Control', 'no-store')
  getIdentity(): SharedServiceIdentityResponse {
    const deploymentId = getNonEmptyEnvironmentValue('RAILWAY_DEPLOYMENT_ID');
    const instanceId =
      getNonEmptyEnvironmentValue('RAILWAY_REPLICA_ID') ??
      getNonEmptyEnvironmentValue('CONTAINER_INSTANCE_ID') ??
      deploymentId ??
      LOCAL_INSTANCE_ID;

    return SharedServiceIdentityResponseSchema.parse({
      status: 'ok',
      service: BUSINESS_SERVICE_NAME,
      instanceId,
      deploymentId: deploymentId ?? null,
      version:
        getNonEmptyEnvironmentValue('SERVICE_VERSION') ??
        getNonEmptyEnvironmentValue('RAILWAY_GIT_COMMIT_SHA') ??
        UNKNOWN_SERVICE_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }
}

export { HealthController };
