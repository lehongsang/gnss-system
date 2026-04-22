import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telemetry } from './entities/telemetry.entity';
import {
  TelemetryHistoryQueryDto,
  NearbyQueryDto,
} from './dtos/query-telemetry.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import type { CoordinatePayload } from '@/commons/interfaces/app.interface';



@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(Telemetry)
    private readonly telemetryRepository: Repository<Telemetry>,
    private readonly devicesService: DevicesService,
  ) {}


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
      altitude: payload.altitude,
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
