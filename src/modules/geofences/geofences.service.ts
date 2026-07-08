import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Geofence } from './entities/geofence.entity';
import {
  GeofenceDeviceState,
  GeofencePresenceState,
} from './entities/geofence-device-state.entity';
import { CreateGeofenceDto } from './dtos/create-geofence.dto';
import { UpdateGeofenceDto } from './dtos/update-geofence.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { AlertType, GeofenceType } from '@/commons/enums/app.enum';
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

export interface GeofenceViolation {
  geofence: Geofence;
  alertType: AlertType.GEOFENCE_EXIT | AlertType.GEOFENCE_ENTRY;
  currentState: GeofencePresenceState;
  previousState: GeofencePresenceState | null;
}

interface GeofenceStateRow {
  id: string;
  name: string;
  color: string | null;
  type: GeofenceType;
  created_by: string | null;
  createdAt: Date;
  updatedAt: Date;
  deleted_at: Date | null;
  is_inside: boolean;
}

const parseGeom = (
  geomStr: string | null,
): {
  parsedGeom: GeoJSONPolygon | null;
  paths: { lat: number; lng: number }[];
  vertexCount: number;
} => {
  let parsedGeom: GeoJSONPolygon | null = null;
  let paths: { lat: number; lng: number }[] = [];

  if (geomStr) {
    try {
      const geojson = JSON.parse(geomStr) as GeoJSONPolygon;
      parsedGeom = geojson;
      if (
        geojson.type === 'Polygon' &&
        geojson.coordinates &&
        geojson.coordinates[0]
      ) {
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
    // GeoJSON Polygon lặp lại điểm đầu ở cuối để khép kín vòng, nên trừ 1 để ra số đỉnh thực
    vertexCount: paths.length > 0 ? paths.length - 1 : 0,
  };
};

@Injectable()
export class GeofencesService {
  constructor(
    @InjectRepository(Geofence)
    private readonly geofenceRepository: Repository<Geofence>,
    @InjectRepository(GeofenceDeviceState)
    private readonly geofenceDeviceStateRepository: Repository<GeofenceDeviceState>,
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
      const typedRaw = raw as {
        geofence_id: string;
        geofence_geom: string | null;
      }[];
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

    // Query raw để lấy geom dạng GeoJSON, vì entity không tự parse cột kiểu geometry của PostGIS
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

  async create(
    dto: CreateGeofenceDto,
    userId: string,
  ): Promise<EnrichedGeofence> {
    const geofence = this.geofenceRepository.create({
      name: dto.name,
      type: dto.type ?? GeofenceType.ALLOWED_ZONE,
      color: dto.color,
      createdBy: userId,
    });
    const saved = await this.geofenceRepository.save(geofence);

    // Lưu geom bằng câu lệnh PostGIS trực tiếp thay vì qua ORM vì TypeORM không map được kiểu geometry
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
      throw new ForbiddenException(
        'You do not have permission to access this geofence',
      );
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
    if (dto.type !== undefined) {
      geofence.type = dto.type;
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
      throw new ForbiddenException(
        'You do not have permission to access this geofence',
      );
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

    const device = await this.devicesService.findOne(
      deviceId,
      geofence.createdBy || '',
      true,
    );

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
    const violations = await this.evaluateGeofenceTransitions(
      deviceId,
      lat,
      lng,
    );
    return violations.map((violation) => violation.geofence);
  }

  /**
   * Kiểm tra toàn bộ geofence đã gán cho thiết bị, chỉ trả về những vi phạm MỚI xảy ra.
   * Bảng lưu trạng thái (geofenceDeviceState) giúp tránh bắn alert lặp lại khi
   * thiết bị vẫn đứng yên trong cùng một trạng thái vi phạm từ lần kiểm tra trước.
   */
  async evaluateGeofenceTransitions(
    deviceId: string,
    lat: number,
    lng: number,
  ): Promise<GeofenceViolation[]> {
    const rows = await this.geofenceRepository.query<GeofenceStateRow[]>(
      `
      SELECT
        g.id,
        g.name,
        g.color,
        COALESCE(g.type, 'allowed_zone') AS type,
        g.created_by,
        g."createdAt",
        g."updatedAt",
        g.deleted_at,
        -- Kiểm tra điểm (lng, lat) hiện tại có nằm trong đa giác geofence hay không
        ST_Within(ST_SetSRID(ST_MakePoint($2, $3), 4326), g.geom) AS is_inside
      FROM geofences g
      JOIN device_geofence dg ON dg.geofence_id = g.id
      WHERE dg.device_id = $1
        AND g.deleted_at IS NULL
      `,
      [deviceId, lng, lat],
    );

    const violations: GeofenceViolation[] = [];

    for (const row of rows) {
      const currentState = row.is_inside
        ? GeofencePresenceState.INSIDE
        : GeofencePresenceState.OUTSIDE;
      const previousState = await this.getPreviousState(deviceId, row.id);
      // Luôn cập nhật trạng thái mới nhất trước, dù có vi phạm hay không
      await this.saveCurrentState(deviceId, row.id, currentState);

      // Vùng ALLOWED_ZONE: vi phạm khi thiết bị đi RA NGOÀI
      // Vùng FORBIDDEN_ZONE: vi phạm khi thiết bị đi VÀO TRONG
      const isViolation =
        (row.type === GeofenceType.ALLOWED_ZONE &&
          currentState === GeofencePresenceState.OUTSIDE) ||
        (row.type === GeofenceType.FORBIDDEN_ZONE &&
          currentState === GeofencePresenceState.INSIDE);

      if (!isViolation) continue;

      // Chỉ coi là vi phạm mới khi trạng thái vừa đổi (tránh spam alert mỗi lần telemetry gửi về)
      const isNewViolation =
        previousState === null || previousState !== currentState;
      if (!isNewViolation) continue;

      const geofence = this.geofenceRepository.create({
        id: row.id,
        name: row.name,
        color: row.color ?? '#3b82f6',
        type: row.type,
        createdBy: row.created_by,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deleted_at,
      });

      violations.push({
        geofence,
        alertType:
          row.type === GeofenceType.ALLOWED_ZONE
            ? AlertType.GEOFENCE_EXIT
            : AlertType.GEOFENCE_ENTRY,
        currentState,
        previousState,
      });
    }

    return violations;
  }

  private async getPreviousState(
    deviceId: string,
    geofenceId: string,
  ): Promise<GeofencePresenceState | null> {
    const state = await this.geofenceDeviceStateRepository.findOne({
      where: { deviceId, geofenceId },
    });
    return state?.state ?? null;
  }

  private async saveCurrentState(
    deviceId: string,
    geofenceId: string,
    state: GeofencePresenceState,
  ): Promise<void> {
    const existing = await this.geofenceDeviceStateRepository.findOne({
      where: { deviceId, geofenceId },
    });

    if (existing) {
      existing.state = state;
      await this.geofenceDeviceStateRepository.save(existing);
      return;
    }

    await this.geofenceDeviceStateRepository.save(
      this.geofenceDeviceStateRepository.create({
        deviceId,
        geofenceId,
        state,
      }),
    );
  }
}
