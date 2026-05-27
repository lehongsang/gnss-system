import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardStatsResponse } from './dtos/dashboard-stats.response';

interface CountRow {
  count: string;
}

interface AlertStatsRow {
  alerts24h: string;
  criticalAlerts: string;
  warningAlerts: string;
  infoAlerts: string;
}

/**
 * Provides user-scoped aggregate data for dashboard screens.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Builds the current user's dashboard summary using owner-scoped aggregate queries.
   */
  async getStats(userId: string): Promise<DashboardStatsResponse> {
    const mediaTotalBytes = Number(
      process.env.DASHBOARD_MEDIA_TOTAL_BYTES || 5 * 1024 * 1024 * 1024,
    );

    const [
      totalDevices,
      onlineDevices,
      alertStats,
      telemetryPoints,
      telemetryRatePoints,
      mediaUsedRows,
    ] = await Promise.all([
      this.count(
        `SELECT COUNT(*) AS count FROM devices WHERE owner_id = $1 AND deleted_at IS NULL`,
        [userId],
      ),
      this.count(
        `
        SELECT COUNT(*) AS count
        FROM devices d
        JOIN device_status ds ON ds.device_id = d.id
        WHERE d.owner_id = $1
          AND d.deleted_at IS NULL
          AND ds.status = 'online'
        `,
        [userId],
      ),
      this.getAlertStats(userId),
      this.count(
        `
        SELECT COUNT(*) AS count
        FROM telemetry t
        JOIN devices d ON d.id = t.device_id
        WHERE d.owner_id = $1
          AND d.deleted_at IS NULL
          AND t.deleted_at IS NULL
        `,
        [userId],
      ),
      this.count(
        `
        SELECT COUNT(*) AS count
        FROM telemetry t
        JOIN devices d ON d.id = t.device_id
        WHERE d.owner_id = $1
          AND d.deleted_at IS NULL
          AND t.deleted_at IS NULL
          AND t.timestamp >= NOW() - INTERVAL '1 minute'
        `,
        [userId],
      ),
      this.dataSource.query<{ size: string }[]>(
        `SELECT COALESCE(SUM(size), 0) AS size FROM medias WHERE created_by = $1 AND deleted_at IS NULL`,
        [userId],
      ),
    ]);

    const mediaUsedBytes = Number(mediaUsedRows[0]?.size ?? 0);

    return {
      totalDevices,
      onlineDevices,
      offlineDevices: Math.max(totalDevices - onlineDevices, 0),
      alerts24h: Number(alertStats.alerts24h),
      criticalAlerts: Number(alertStats.criticalAlerts),
      warningAlerts: Number(alertStats.warningAlerts),
      infoAlerts: Number(alertStats.infoAlerts),
      telemetryPoints,
      telemetryRate: `${telemetryRatePoints}/min`,
      mediaUsedBytes,
      mediaTotalBytes,
    };
  }

  /**
   * Runs a COUNT query and converts the Postgres string count to number.
   */
  private async count(query: string, params: string[]): Promise<number> {
    const rows = await this.dataSource.query<CountRow[]>(query, params);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Counts user-owned alerts from the last 24 hours by dashboard severity bucket.
   */
  private async getAlertStats(userId: string): Promise<AlertStatsRow> {
    const rows = await this.dataSource.query<AlertStatsRow[]>(
      `
      SELECT
        COUNT(*) AS "alerts24h",
        COUNT(*) FILTER (
          WHERE a.alert_type IN ('dangerous_obstacle', 'signal_lost', 'geofence_entry')
        ) AS "criticalAlerts",
        COUNT(*) FILTER (
          WHERE a.alert_type IN ('speeding', 'geofence_exit', 'trajectory_deviation')
        ) AS "warningAlerts",
        COUNT(*) FILTER (
          WHERE a.alert_type NOT IN (
            'dangerous_obstacle',
            'signal_lost',
            'geofence_entry',
            'speeding',
            'geofence_exit',
            'trajectory_deviation'
          )
        ) AS "infoAlerts"
      FROM alerts a
      JOIN devices d ON d.id = a.device_id
      WHERE d.owner_id = $1
        AND d.deleted_at IS NULL
        AND a.deleted_at IS NULL
        AND a."createdAt" >= NOW() - INTERVAL '24 hours'
      `,
      [userId],
    );

    return rows[0] ?? {
      alerts24h: '0',
      criticalAlerts: '0',
      warningAlerts: '0',
      infoAlerts: '0',
    };
  }
}
