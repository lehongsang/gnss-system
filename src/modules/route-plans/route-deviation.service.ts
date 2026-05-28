import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutePlan } from './entities/route-plan.entity';
import { AlertsService } from '@/modules/alerts/alerts.service';
import { RedisService } from '@/services/redis/redis.service';
import { AlertType, RoutePlanStatus } from '@/commons/enums/app.enum';
import type { CoordinatePayload } from '@/commons/interfaces/app.interface';
import { LoggerService } from '@/commons/logger/logger.service';

interface ActiveRouteDistanceRow {
  id: string;
  name: string | null;
  deviation_threshold_meters: number;
  distance_meters: number;
}

@Injectable()
export class RouteDeviationService {
  private readonly logger = new LoggerService(RouteDeviationService.name);

  constructor(
    @InjectRepository(RoutePlan)
    private readonly routePlanRepository: Repository<RoutePlan>,
    private readonly alertsService: AlertsService,
    private readonly redisService: RedisService,
  ) {}

  async checkDeviation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    try {
      const rows = await this.routePlanRepository.query<ActiveRouteDistanceRow[]>(
        `
        SELECT
          id,
          name,
          deviation_threshold_meters,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
          ) AS distance_meters
        FROM route_plans
        WHERE device_id = $1
          AND status = $4
          AND deleted_at IS NULL
          AND geom IS NOT NULL
        ORDER BY activated_at DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
        `,
        [deviceId, payload.lng, payload.lat, RoutePlanStatus.ACTIVE],
      );
      const activeRoute = rows[0];
      if (!activeRoute) return;

      const distanceMeters = Number(activeRoute.distance_meters);
      const thresholdMeters = Number(activeRoute.deviation_threshold_meters);
      if (distanceMeters <= thresholdMeters) return;

      const cooldownKey = `trajectory_deviation:${deviceId}:${activeRoute.id}`;
      const alreadyAlerted = await this.redisService.get(cooldownKey);
      if (alreadyAlerted) return;

      await this.alertsService.create({
        deviceId,
        alertType: AlertType.TRAJECTORY_DEVIATION,
        message: `Device deviated ${distanceMeters.toFixed(0)}m from route${activeRoute.name ? ` "${activeRoute.name}"` : ''}`,
        lat: payload.lat,
        lng: payload.lng,
      });

      const cooldownSeconds = Number(
        process.env.ROUTE_DEVIATION_COOLDOWN_SECONDS || 300,
      );
      await this.redisService.setex(cooldownKey, cooldownSeconds, '1');

      this.logger.warn(
        `TRAJECTORY_DEVIATION for device ${deviceId}: ${distanceMeters.toFixed(0)}m > ${thresholdMeters}m`,
      );
    } catch (error) {
      this.logger.warn(
        `Route deviation check failed for device ${deviceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
