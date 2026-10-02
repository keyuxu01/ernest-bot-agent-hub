import { Controller, Get, Header } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  HealthProbeResponseSchema,
  ServiceIdentityResponseSchema,
  type HealthProbeResponse,
  type ServiceIdentityResponse,
} from '@repo/contracts';
import {
  BUSINESS_SERVICE_NAME,
  LOCAL_INSTANCE_ID,
  UNKNOWN_SERVICE_VERSION,
} from './health.constants';

const getNonEmptyEnvironmentValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value === '' ? undefined : value;
};

@Controller('health')
class HealthController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get('live')
  @HealthCheck()
  async getLiveness(): Promise<HealthProbeResponse> {
    const result = await this.healthCheckService.check([]);

    return HealthProbeResponseSchema.parse(result);
  }

  @Get('ready')
  @HealthCheck()
  async getReadiness(): Promise<HealthProbeResponse> {
    const result = await this.healthCheckService.check([]);

    return HealthProbeResponseSchema.parse(result);
  }

  @Get('whoami')
  @Header('Cache-Control', 'no-store')
  getIdentity(): ServiceIdentityResponse {
    const deploymentId = getNonEmptyEnvironmentValue('RAILWAY_DEPLOYMENT_ID');
    const instanceId =
      getNonEmptyEnvironmentValue('RAILWAY_REPLICA_ID') ??
      getNonEmptyEnvironmentValue('CONTAINER_INSTANCE_ID') ??
      deploymentId ??
      LOCAL_INSTANCE_ID;

    return ServiceIdentityResponseSchema.parse({
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
