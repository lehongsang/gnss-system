import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Geofence } from './entities/geofence.entity';
import { CreateGeofenceDto } from './dtos/create-geofence.dto';
import { UpdateGeofenceDto } from './dtos/update-geofence.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/commons/dtos/get-many-base.dto';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';

@Injectable()
export class GeofencesService {
  constructor(
    @InjectRepository(Geofence)
    private readonly geofenceRepository: Repository<Geofence>,
    private readonly devicesService: DevicesService,
  ) {}

  async findAll(
    query: GetManyBaseQueryParams,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<GetManyBaseResponseDto<Geofence>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search = '',
    } = query;
    const qb = this.geofenceRepository
      .createQueryBuilder('geofence')
      .leftJoinAndSelect('geofence.devices', 'devices')
      .select([
        'geofence.id',
        'geofence.name',
        'geofence.createdBy',
        'geofence.createdAt',
        'geofence.updatedAt',
        'ST_AsGeoJSON(geofence.geom) as geom',
        'devices',
      ]);

    if (!isAdmin) {
      qb.where('geofence.createdBy = :requesterId', { requesterId });
    }

    if (search) {
      qb.andWhere('geofence.name ILIKE :search', { search: `%${search}%` });
    }

    // Using query raw mapping to parse GeoJSON appropriately might be needed here.
    // This is simplified standard execution.
    const [data, total] = await qb
      .orderBy(`geofence.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Geofence> {
    const geofence = await this.geofenceRepository.findOne({
      where: { id },
      relations: ['devices'],
    });
    if (!geofence) throw new NotFoundException('Geofence not found');

    if (!isAdmin && geofence.createdBy !== requesterId) {
      throw new ForbiddenException(
        'You do not have permission to access this geofence',
      );
    }

    // Parse Geom here via raw if needed:
    const raw = await this.geofenceRepository.query<{ geom: string }[]>(
      `SELECT ST_AsGeoJSON(geom) as geom FROM geofences WHERE id = $1`,
      [id],
    );
    if (raw && raw[0]?.geom) {
      (geofence as Geofence & { geom: unknown }).geom = JSON.parse(
        raw[0].geom,
      ) as unknown;
    }

    return geofence;
  }

  async create(dto: CreateGeofenceDto, userId: string): Promise<Geofence> {
    const geofence = this.geofenceRepository.create({
      name: dto.name,
      createdBy: userId,
    });
    const saved = await this.geofenceRepository.save(geofence);

    // Save GeoJSON geom directly via PostGIS
    await this.geofenceRepository.query(
      `
      UPDATE geofences SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2
    `,
      [JSON.stringify(dto.geom), saved.id],
    );

    return this.findOne(saved.id, userId, true);
  }

  async update(
    id: string,
    dto: UpdateGeofenceDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Geofence> {
    const geofence = await this.findOne(id, requesterId, isAdmin);

    if (dto.name) {
      geofence.name = dto.name;
      await this.geofenceRepository.save(geofence);
    }

    if (dto.geom) {
      await this.geofenceRepository.query(
        `
        UPDATE geofences SET geom = ST_GeomFromGeoJSON($1) WHERE id = $2
      `,
        [JSON.stringify(dto.geom), geofence.id],
      );
    }

    return this.findOne(id, requesterId, isAdmin);
  }

  async remove(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DefaultMessageResponseDto> {
    const geofence = await this.findOne(id, requesterId, isAdmin);
    await this.geofenceRepository.remove(geofence);
    return { message: 'Geofence deleted successfully' };
  }

  async assignDevice(
    geofenceId: string,
    deviceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const geofence = await this.geofenceRepository.findOne({
      where: { id: geofenceId },
      relations: ['devices'],
    });
    if (!geofence) throw new NotFoundException('Geofence not found');

    const device =
      (await this.devicesService.findByMac(deviceId)) ||
      (await this.devicesService.findOne(
        deviceId,
        geofence.createdBy || '',
        true,
      ));

    const exists = geofence.devices.find((d) => d.id === device.id);
    if (!exists) {
      geofence.devices.push(device);
      await this.geofenceRepository.save(geofence);
    }
    return { message: 'Device assigned to geofence' };
  }

  async removeDevice(
    geofenceId: string,
    deviceId: string,
  ): Promise<DefaultMessageResponseDto> {
    const geofence = await this.geofenceRepository.findOne({
      where: { id: geofenceId },
      relations: ['devices'],
    });
    if (!geofence) throw new NotFoundException('Geofence not found');

    geofence.devices = geofence.devices.filter((d) => d.id !== deviceId);
    await this.geofenceRepository.save(geofence);
    return { message: 'Device removed from geofence' };
  }

  async getViolatedGeofences(
    deviceId: string,
    lat: number,
    lng: number,
  ): Promise<Geofence[]> {
    // Check if device is outside geofences it is assigned to. Wait: geofence = safe zone?
    // "getViolatedGeofences: return geofences that the device has EXITED or violated"

    // Find all geofences for this device that do NOT contain the point.
    const violated = await this.geofenceRepository.query<Geofence[]>(
      `
      SELECT g.*
      FROM geofences g
      JOIN device_geofence dg ON dg.geofence_id = g.id
      WHERE dg.device_id = $1
      AND NOT ST_Within(ST_SetSRID(ST_MakePoint($2, $3), 4326), g.geom)
    `,
      [deviceId, lng, lat],
    );

    return violated;
  }
}
