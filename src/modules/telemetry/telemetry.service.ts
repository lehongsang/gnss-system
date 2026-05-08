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
   * TypeORM `synchronize` drops geometry columns it cannot manage natively,
   * so we recreate them every time the application boots.
   */
  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_telemetry_geom ON telemetry USING GIST (geom);
      ALTER TABLE geofences ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326);
      CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST (geom);
    `);

    // Backfill geom from lat/lng for rows that lost geometry data after synchronize
    const backfillResult: [unknown, number] = await this.dataSource.query(
      `UPDATE telemetry SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE geom IS NULL`,
    );
    const count = backfillResult[1];
    if (count > 0) {
      this.logger.log(`Backfilled geom for ${count} telemetry rows`);
    }

    this.logger.log('PostGIS geometry columns ensured on telemetry & geofences');
  }


  /**
   * Persists a single GPS coordinate point for a device.
   * After inserting the row, updates the PostGIS `geom` column via raw SQL
   * since TypeORM cannot natively serialize geometry types.
   */
  async savePoint(deviceId: string, payload: CoordinatePayload): Promise<void> {
    // Step 1: Create the telemetry record with all fields
    const telemetry = this.telemetryRepository.create({
      deviceId,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed,
      heading: payload.heading,
      timestamp: payload.timestamp,
      accuracyStatus: payload.accuracyStatus,
    });

    // Step 2: Persist the record
    await this.telemetryRepository.save(telemetry);

    // Step 3: Update PostGIS geometry column via raw SQL
    await this.telemetryRepository.query(
      `
      UPDATE telemetry SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3
    `,
      [payload.lng, payload.lat, telemetry.id],
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
