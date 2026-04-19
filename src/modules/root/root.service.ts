import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheck,
  HealthCheckResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { RedisService } from '@/services/redis/redis.service';

@Injectable()
export class RootService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisService: RedisService,
  ) {}

  @HealthCheck()
  public async getHealth(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        try {
          await this.redisService.client.ping();
          return { redis: { status: 'up' } };
        } catch (e) {
          const error = e as Error;
          throw new HealthCheckError('Redis check failed', {
            redis: { status: 'down', message: error.message },
          });
        }
      },
    ]);
  }
}
