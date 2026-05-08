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

export interface GeoJSONPolygon {
  type: string;
  coordinates: [number, number][][];
}

export interface EnrichedGeofence extends Omit<Geofence, 'geom' | 'devices'> {
  geom: GeoJSONPolygon | null;
  paths: { lat: number; lng: number }[];
  vertexCount: number;
  Devices: string[];
}

const parseGeom = (geomStr: string | null): { parsedGeom: GeoJSONPolygon | null, paths: { lat: number; lng: number }[], vertexCount: number } => {
  let parsedGeom: GeoJSONPolygon | null = null;
  let paths: { lat: number; lng: number }[] = [];
  
  if (geomStr) {
    try {
      const geojson = JSON.parse(geomStr) as GeoJSONPolygon;
      parsedGeom = geojson;
      if (geojson.type === 'Polygon' && geojson.coordinates && geojson.coordinates[0]) {
        paths = geojson.coordinates[0].map((coord: [number, number]) => ({
          lng: coord[0],
          lat: coord[1],
        }));
      }
    } catch {
      parsedGeom = null;
    }
  }
  
  return {
    parsedGeom,
    paths,
    vertexCount: paths.length > 0 ? paths.length - 1 : 0,
  };
};

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
  ): Promise<GetManyBaseResponseDto<EnrichedGeofence>> {
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
      .addSelect('ST_AsGeoJSON(geofence.geom)', 'geofence_geom');

    if (!isAdmin) {
      qb.where('geofence.createdBy = :requesterId', { requesterId });
    }

    if (search) {
      qb.andWhere('geofence.name ILIKE :search', { search: `%${search}%` });
    }

    const { entities, raw } = await qb
      .orderBy(`geofence.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const data: EnrichedGeofence[] = entities.map((entity) => {
      const typedRaw = raw as { geofence_id: string; geofence_geom: string | null }[];
      const rawRow = typedRaw.find((r) => r.geofence_id === entity.id);
      const geomStr = rawRow?.geofence_geom || null;
      
      const { parsedGeom, paths, vertexCount } = parseGeom(geomStr);

      return {
        ...entity,
        geom: parsedGeom,
        paths,
        vertexCount,
        Devices: entity.devices?.map((d) => d.id) || [],
      } as unknown as EnrichedGeofence;
    });

    const total = await qb.getCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedGeofence> {
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
    const geomStr = raw && raw[0]?.geom ? raw[0].geom : null;
    const { parsedGeom, paths, vertexCount } = parseGeom(geomStr);

    const enrichedGeofence = {
      ...geofence,
      geom: parsedGeom,
      paths,
      vertexCount,
      Devices: geofence.devices?.map((d) => d.id) || [],
    } as unknown as EnrichedGeofence;

    return enrichedGeofence;
  }

  async create(dto: CreateGeofenceDto, userId: string): Promise<EnrichedGeofence> {
    const geofence = this.geofenceRepository.create({
      name: dto.name,
      color: dto.color,
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
  ): Promise<EnrichedGeofence> {
    const geofence = await this.geofenceRepository.findOne({ where: { id } });
    if (!geofence) throw new NotFoundException('Geofence not found');
    if (!isAdmin && geofence.createdBy !== requesterId) {
      throw new ForbiddenException('You do not have permission to access this geofence');
    }

    let isUpdated = false;
    if (dto.name !== undefined) {
      geofence.name = dto.name;
      isUpdated = true;
    }
    if (dto.color !== undefined) {
      geofence.color = dto.color;
      isUpdated = true;
    }

    if (isUpdated) {
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
    const geofence = await this.geofenceRepository.findOne({ where: { id } });
    if (!geofence) throw new NotFoundException('Geofence not found');

    if (!isAdmin && geofence.createdBy !== requesterId) {
      throw new ForbiddenException('You do not have permission to access this geofence');
    }

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
