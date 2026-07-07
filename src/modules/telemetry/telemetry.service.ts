import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Telemetry } from './entities/telemetry.entity';
import {
  TelemetryHistoryQueryDto,
  NearbyQueryDto,
} from './dtos/query-telemetry.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import type { CoordinatePayload } from '@/commons/interfaces/app.interface';
import { LoggerService } from '@/commons/logger/logger.service';



@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = new LoggerService(TelemetryService.name);

  constructor(
    @InjectRepository(Telemetry)
    private readonly telemetryRepository: Repository<Telemetry>,
    private readonly devicesService: DevicesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Ensures PostGIS geometry columns and spatial indexes exist on startup.
   * If TimescaleDB is available, converts the telemetry table to a hypertable.
   */
  async onModuleInit(): Promise<void> {
    try {
      // 1. Force refresh PostGIS (Drop and Recreate to fix library path issues)
      // Since it's a new server, this is the safest way to fix Version Mismatch
      try {
        await this.dataSource.query(`DROP EXTENSION IF EXISTS postgis CASCADE`);
      } catch {
        this.logger.warn('Could not drop postgis extension (might not exist)');
      }
      
      await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
      await this.dataSource.query(
        `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`,
      );


      // 2. Ensure geometry columns & indexes
      await this.dataSource.query(`
        ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
        CREATE INDEX IF NOT EXISTS idx_telemetry_geom ON telemetry USING GIST (geom);
        ALTER TABLE geofences ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326);
        CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST (geom);
        ALTER TABLE route_plans ADD COLUMN IF NOT EXISTS geom geometry(LineString, 4326);
        CREATE INDEX IF NOT EXISTS idx_route_plans_geom ON route_plans USING GIST (geom);
      `);

      // 3. Convert to Hypertable if not already done (TimescaleDB specific)
      // We wrap this in a check to see if it's already a hypertable
      const isHypertable = await this.dataSource.query<{ count: string }[]>(`
        SELECT count(*) FROM _timescaledb_catalog.hypertable WHERE table_name = 'telemetry'
      `);

      if (isHypertable.length === 0 || parseInt(isHypertable[0].count) === 0) {
        this.logger.log(
          'Converting telemetry table to TimescaleDB hypertable...',
        );
        await this.dataSource.query(
          `SELECT create_hypertable('telemetry', 'timestamp', if_not_exists => TRUE)`,
        );

        // 3a. Enable Compression (Job runs in background)
        await this.dataSource.query(`
          ALTER TABLE telemetry SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'device_id'
          );
          SELECT add_compression_policy('telemetry', INTERVAL '7 days');
        `);

        // 3b. Enable Statistics/Retention (Keep 6 months of raw data)
        await this.dataSource.query(`
          SELECT add_retention_policy('telemetry', INTERVAL '6 months');
        `);

        this.logger.log('Compression and Retention policies enabled');
      }


      // 4. Backfill missing geoms
      await this.dataSource.query(
        `UPDATE telemetry SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE geom IS NULL`,
      );

      this.logger.log('Telemetry storage optimized (PostGIS + TimescaleDB)');
    } catch (error) {
      this.logger.error('Failed to optimize telemetry storage:', error);
    }
  }

  /**
   * Persists a single GPS coordinate point for a device in a single SQL operation.
   * Calculates the PostGIS geometry point during INSERT for maximum performance.
   */
  async savePoint(deviceId: string, payload: CoordinatePayload): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO telemetry (device_id, lat, lng, speed, heading, timestamp, accuracy_status, geom)
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($3, $2), 4326))
    `,
      [
        deviceId,
        payload.lat,
        payload.lng,
        payload.speed,
        payload.heading,
        payload.timestamp,
        payload.accuracyStatus,
      ],
    );
  }

  /**
   * Persists a batch of telemetry points in a single multi-row INSERT.
   * This is the preferred method for high-throughput ingestion.
   */
  async saveBatch(
    points: { deviceId: string; payload: CoordinatePayload }[],
  ): Promise<void> {
    if (points.length === 0) return;

    const values = points
      .map(
        (_, i) =>
          `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7}, ST_SetSRID(ST_MakePoint($${i * 7 + 3}, $${i * 7 + 2}), 4326))`,
      )
      .join(',');

    const flatParams = points.flatMap((p) => [
      p.deviceId,
      p.payload.lat,
      p.payload.lng,
      p.payload.speed,
      p.payload.heading,
      p.payload.timestamp,
      p.payload.accuracyStatus,
    ]);

    await this.dataSource.query(
      `INSERT INTO telemetry (device_id, lat, lng, speed, heading, timestamp, accuracy_status, geom) VALUES ${values}`,
      flatParams,
    );
  }


  async findHistory(
    deviceId: string,
    query: TelemetryHistoryQueryDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<GetManyBaseResponseDto<Telemetry>> {
    await this.devicesService.findOne(deviceId, requesterId, isAdmin); // ownership check

    const {
      page = 1,
      limit = 100,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
    } = query;
    const qb = this.telemetryRepository
      .createQueryBuilder('telemetry')
      .where('telemetry.deviceId = :deviceId', { deviceId })
      .andWhere('telemetry.timestamp >= :from AND telemetry.timestamp <= :to', {
        from: query.from,
        to: query.to,
      });

    const [data, total] = await qb
      .orderBy(`telemetry.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findLatest(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Telemetry> {
    await this.devicesService.findOne(deviceId, requesterId, isAdmin); // ownership check

    const latest = await this.telemetryRepository.findOne({
      where: { deviceId },
      order: { timestamp: 'DESC' },
    });

    if (!latest)
      throw new NotFoundException('No telemetry data found for this device');
    return latest;
  }

  /**
   * Returns the latest telemetry point for a device WITHOUT ownership checks.
   * Used internally by system consumers (e.g., AlertsConsumer) to look up
   * the most recent GPS coordinates for AI-generated alerts.
   * Returns null (instead of throwing) when no telemetry exists.
   */
  async findLatestByDevice(deviceId: string): Promise<Telemetry | null> {
    return this.telemetryRepository.findOne({
      where: { deviceId },
      order: { timestamp: 'DESC' },
    });
  }

  /**
   * Returns the latest telemetry point for EVERY device in a single query.
   * Uses PostgreSQL DISTINCT ON to efficiently pick the newest row per device_id.
   */
  async findLatestAll(): Promise<Telemetry[]> {
    return this.telemetryRepository.query(`
      SELECT DISTINCT ON (device_id) *
      FROM telemetry
      ORDER BY device_id, timestamp DESC
    `);
  }

  /**
   * Returns the latest telemetry point for every device owned by the requester.
   * Uses DISTINCT ON to avoid N+1 queries from dashboard screens.
   */
  async findLatestMine(ownerId: string): Promise<Telemetry[]> {
    return this.telemetryRepository.query<Telemetry[]>(
      `
      SELECT DISTINCT ON (t.device_id) t.*
      FROM telemetry t
      JOIN devices d ON d.id = t.device_id
      WHERE d.owner_id = $1
        AND d.deleted_at IS NULL
        AND t.deleted_at IS NULL
      ORDER BY t.device_id, t.timestamp DESC
      `,
      [ownerId],
    );
  }

  async findNearby(query: NearbyQueryDto): Promise<Telemetry[]> {
    // PostGIS query for nearby telemetry points
    return this.telemetryRepository.query(
      `
      SELECT *, ST_AsGeoJSON(geom) as geom
      FROM telemetry
      WHERE ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      ORDER BY timestamp DESC
      LIMIT 100
    `,
      [query.lng, query.lat, query.radius],
    );
  }
}
