import { Controller, Get, Header } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  SharedHealthProbeResponseSchema,
  SharedServiceIdentityResponseSchema,
  type SharedHealthProbeResponse,
  type SharedServiceIdentityResponse,
} from '@repo/contracts';
import {
  LOCAL_INSTANCE_ID,
  UNKNOWN_SERVICE_VERSION,
  USER_PLATFORM_SERVICE_NAME,
} from './health.constants';
import { CorrelationContext } from '../../infrastructure/observability/correlation-context';

const getNonEmptyEnvironmentValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === '' ? undefined : value;
};

@Controller('health')
class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly correlation: CorrelationContext,
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
    // 当前仅是进程级脚手架；数据库和 OAuth 依赖接入后再加入 readiness 指标。
    const result = await this.healthCheckService.check([]);
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
      service: USER_PLATFORM_SERVICE_NAME,
      instanceId,
      deploymentId: deploymentId ?? null,
      version:
        getNonEmptyEnvironmentValue('SERVICE_VERSION') ??
        getNonEmptyEnvironmentValue('RAILWAY_GIT_COMMIT_SHA') ??
        UNKNOWN_SERVICE_VERSION,
      buildId: getNonEmptyEnvironmentValue('SERVICE_BUILD_ID') ?? 'local',
      correlationId: this.correlation.getCorrelationId(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  }
}

export { HealthController };
