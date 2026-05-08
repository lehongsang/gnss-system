import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { Roles } from '@thallesp/nestjs-better-auth';
import { Role } from '@/commons/enums/app.enum';
import { Doc } from '@/commons/docs/doc.decorator';
import {
  SystemOverviewResponse,
  TelemetryStatResponse,
  AlertTypeStatResponse,
  MediaStatResponse,
} from './dtos/statistics.response';

@ApiTags('Admin Statistics')
@Controller('admin/statistics')
@Roles([Role.ADMIN])
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /**
   * Get high-level system overview stats (users, devices, geofences, alerts)
   */
  @Get('overview')
  @Doc({
    summary: 'Role: Admin - Get system overview statistics',
    response: { serialization: SystemOverviewResponse },
  })
  async getOverview() {
    return this.statisticsService.getOverview();
  }

  /**
   * Get telemetry data points aggregated per day for the last 7 days
   */
  @Get('telemetry')
  @Doc({
    summary: 'Role: Admin - Get telemetry time-series stats (last 7 days)',
    response: { serialization: TelemetryStatResponse, isArray: true },
  })
  async getTelemetryStats() {
    return this.statisticsService.getTelemetryStats();
  }

  /**
   * Get alert count grouped by alert type
   */
  @Get('alerts')
  @Doc({
    summary: 'Role: Admin - Get alert type distribution stats',
    response: { serialization: AlertTypeStatResponse, isArray: true },
  })
  async getAlertTypeStats() {
    return this.statisticsService.getAlertTypeStats();
  }

  /**
   * Get media log uploads (images & videos) aggregated per day for the last 7 days
   */
  @Get('media')
  @Doc({
    summary: 'Role: Admin - Get media upload stats (last 7 days)',
    response: { serialization: MediaStatResponse, isArray: true },
  })
  async getMediaStats() {
    return this.statisticsService.getMediaStats();
  }
}
