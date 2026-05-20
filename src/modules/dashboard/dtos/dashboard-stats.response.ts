import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsResponse {
  @ApiProperty({ description: 'Total devices owned by the current user' })
  totalDevices: number;

  @ApiProperty({ description: 'Online devices owned by the current user' })
  onlineDevices: number;

  @ApiProperty({ description: 'Offline devices owned by the current user' })
  offlineDevices: number;

  @ApiProperty({ description: 'Alerts created in the last 24 hours' })
  alerts24h: number;

  @ApiProperty({ description: 'Critical alerts created in the last 24 hours' })
  criticalAlerts: number;

  @ApiProperty({ description: 'Warning alerts created in the last 24 hours' })
  warningAlerts: number;

  @ApiProperty({ description: 'Informational alerts created in the last 24 hours' })
  infoAlerts: number;

  @ApiProperty({ description: 'Total telemetry points for the current user devices' })
  telemetryPoints: number;

  @ApiProperty({ description: 'Telemetry ingestion rate for the last minute' })
  telemetryRate: string;

  @ApiProperty({ description: 'Known media storage usage in bytes' })
  mediaUsedBytes: number;

  @ApiProperty({ description: 'Configured media storage quota in bytes' })
  mediaTotalBytes: number;
}
