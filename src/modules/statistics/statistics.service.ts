import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { 
  SystemOverviewResponse, 
  TelemetryStatResponse, 
  AlertTypeStatResponse, 
  MediaStatResponse 
} from './dtos/statistics.response';

@Injectable()
export class StatisticsService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview(): Promise<SystemOverviewResponse> {
    // totalUsers, activeUsers, totalDevices, onlineDevices, totalGeofences, totalAlerts
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDevices },
      { count: onlineDevices },
      { count: totalGeofences },
      { count: totalAlerts }
    ] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*) as count FROM "user"`).then((res: { count: string }[]) => res[0]),
      this.dataSource.query(`SELECT COUNT(*) as count FROM "user" WHERE "emailVerified" = true`).then((res: { count: string }[]) => res[0]),
      this.dataSource.query(`SELECT COUNT(*) as count FROM "devices"`).then((res: { count: string }[]) => res[0]),
      this.dataSource.query(`SELECT COUNT(*) as count FROM "device_status" WHERE "status" = 'online'`).then((res: { count: string }[]) => res[0]),
      this.dataSource.query(`SELECT COUNT(*) as count FROM "geofences"`).then((res: { count: string }[]) => res[0]),
      this.dataSource.query(`SELECT COUNT(*) as count FROM "alerts"`).then((res: { count: string }[]) => res[0]),
    ]);

    return {
      totalUsers: parseInt(totalUsers),
      activeUsers: parseInt(activeUsers),
      totalDevices: parseInt(totalDevices),
      onlineDevices: parseInt(onlineDevices),
      totalGeofences: parseInt(totalGeofences),
      totalAlerts: parseInt(totalAlerts),
    };
  }

  async getTelemetryStats(): Promise<TelemetryStatResponse[]> {
    // Generate data for the last 7 days
    const query = `
      SELECT DATE(timestamp) as date, COUNT(*) as points
      FROM telemetry
      WHERE timestamp >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(timestamp)
      ORDER BY DATE(timestamp) ASC
    `;
    const result: { date: string; points: string }[] = await this.dataSource.query(query);
    
    // We want to ensure 7 days are always returned, even if count is 0
    const stats: TelemetryStatResponse[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split('T')[0];
      const found = result.find((r) => new Date(r.date).toISOString().split('T')[0] === dateString);
      stats.push({
        date: dateString,
        points: found ? parseInt(found.points) : 0,
      });
    }
    return stats;
  }

  async getAlertTypeStats(): Promise<AlertTypeStatResponse[]> {
    const query = `
      SELECT alert_type, COUNT(*) as count
      FROM alerts
      GROUP BY alert_type
    `;
    const result: { alert_type: string; count: string }[] = await this.dataSource.query(query);

    // Only return data — color mapping is a frontend (presentation) concern
    return result.map((r) => ({
      name: r.alert_type,
      count: parseInt(r.count),
    }));
  }

  async getMediaStats(): Promise<MediaStatResponse[]> {
    const query = `
      SELECT DATE("createdAt") as date,
             SUM(CASE WHEN media_type = 'image_frame' THEN 1 ELSE 0 END) as images,
             SUM(CASE WHEN media_type = 'video_chunk' THEN 1 ELSE 0 END) as videos
      FROM media_logs
      WHERE "createdAt" >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt") ASC
    `;
    const result: { date: string; images: string; videos: string }[] = await this.dataSource.query(query);

    const stats: MediaStatResponse[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split('T')[0];
      const found = result.find((r) => new Date(r.date).toISOString().split('T')[0] === dateString);
      stats.push({
        date: dateString,
        images: found ? parseInt(found.images) : 0,
        videos: found ? parseInt(found.videos) : 0,
      });
    }
    return stats;
  }
}
