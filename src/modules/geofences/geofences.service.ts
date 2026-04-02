import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Geofence } from './entities/geofence.entity';
import { DeviceGeofence } from './entities/device-geofence.entity';
import {
  AssignDeviceGeofenceDto,
  CreateGeofenceDto,
  GetGeofencesQueryDto,
} from './dtos/geofence.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { LoggerService } from '@/commons/logger/logger.service';

@Injectable()
export class GeofencesService {
  private readonly logger = new LoggerService(GeofencesService.name);

  constructor(
    @InjectRepository(Geofence)
    private readonly geofenceRepo: Repository<Geofence>,
    @InjectRepository(DeviceGeofence)
    private readonly deviceGeofenceRepo: Repository<DeviceGeofence>,
  ) {}

  async create(dto: CreateGeofenceDto, createdBy?: string): Promise<Geofence> {
    const entity = this.geofenceRepo.create({
      name: dto.name,
      // Convert GeoJSON object to WKT POLYGON via ST_GeomFromGeoJSON – passed as raw string
      geom: `SRID=4326;${this.geojsonToWkt(dto.geom)}`,
      createdBy,
    });
    return this.geofenceRepo.save(entity);
  }

  async findAll(query: GetGeofencesQueryDto): Promise<Geofence[]> {
    const where: Record<string, unknown> = {};
    if (query.createdBy) where.createdBy = query.createdBy;
    if (query.search) where.name = ILike(`%${query.search}%`);
    return this.geofenceRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Geofence> {
    const geofence = await this.geofenceRepo.findOne({ where: { id } });
    if (!geofence) throw new NotFound(`Geofence ${id} not found`);
    return geofence;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.geofenceRepo.delete(id);
    this.logger.log(`Geofence ${id} deleted`);
  }

  /** Assign a device to a geofence (idempotent). */
  async assignDevice(dto: AssignDeviceGeofenceDto): Promise<DeviceGeofence> {
    const existing = await this.deviceGeofenceRepo.findOne({
      where: { deviceId: dto.deviceId, geofenceId: dto.geofenceId },
    });
    if (existing) return existing;

    const entity = this.deviceGeofenceRepo.create(dto);
    return this.deviceGeofenceRepo.save(entity);
  }

  /** Remove a device from a geofence. */
  async removeDevice(dto: AssignDeviceGeofenceDto): Promise<void> {
    await this.deviceGeofenceRepo.delete({
      deviceId: dto.deviceId,
      geofenceId: dto.geofenceId,
    });
  }

  /** List all devices assigned to a geofence. */
  async findDevices(geofenceId: string): Promise<DeviceGeofence[]> {
    return this.deviceGeofenceRepo.find({
      where: { geofenceId },
      relations: ['device'],
    });
  }

  /** Simple GeoJSON Polygon → WKT converter (coordinates array). */
  private geojsonToWkt(geojson: object): string {
    const g = geojson as { coordinates: number[][][] };
    const ring = g.coordinates[0]
      .map(([lng, lat]) => `${lng} ${lat}`)
      .join(', ');
    return `POLYGON((${ring}))`;
  }
}
