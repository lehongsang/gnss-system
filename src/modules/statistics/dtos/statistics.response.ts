import { ApiProperty } from '@nestjs/swagger';

export class SystemOverviewResponse {
  @ApiProperty({ description: 'Total number of users' })
  totalUsers: number;

  @ApiProperty({ description: 'Number of active users' })
  activeUsers: number;

  @ApiProperty({ description: 'Total number of devices' })
  totalDevices: number;

  @ApiProperty({ description: 'Number of online devices' })
  onlineDevices: number;

  @ApiProperty({ description: 'Total number of geofences' })
  totalGeofences: number;

  @ApiProperty({ description: 'Total number of alerts' })
  totalAlerts: number;
}

export class TelemetryStatResponse {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Number of telemetry points recorded' })
  points: number;
}

export class AlertTypeStatResponse {
  @ApiProperty({ description: 'Type of the alert' })
  name: string;

  @ApiProperty({ description: 'Number of occurrences' })
  count: number;
}

export class MediaStatResponse {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: 'Number of image frames uploaded' })
  images: number;

  @ApiProperty({ description: 'Number of video chunks uploaded' })
  videos: number;
}
