import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutePlan } from './entities/route-plan.entity';
import { CreateRoutePlanDto } from './dtos/create-route-plan.dto';
import { PreviewRouteDto } from './dtos/preview-route.dto';
import { QueryRoutePlanDto } from './dtos/query-route-plan.dto';
import {
  EnrichedRoutePlan,
  GeoJSONLineString,
  RouteResult,
} from './dtos/route-plan.response';
import { RoutingProviderService } from './routing-provider.service';
import { DevicesService } from '@/modules/devices/devices.service';
import { RoutePlanStatus } from '@/commons/enums/app.enum';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';

@Injectable()
export class RoutePlansService {
  constructor(
    @InjectRepository(RoutePlan)
    private readonly routePlanRepository: Repository<RoutePlan>,
    private readonly routingProviderService: RoutingProviderService,
    private readonly devicesService: DevicesService,
  ) {}

  preview(dto: PreviewRouteDto): Promise<RouteResult> {
    return this.routingProviderService.getRoute(dto);
  }

  async create(
    dto: CreateRoutePlanDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedRoutePlan> {
    const device = await this.devicesService.findOne(
      dto.deviceId,
      requesterId,
      isAdmin,
    );
    const route = await this.routingProviderService.getRoute(dto);
    const plan = this.routePlanRepository.create({
      deviceId: dto.deviceId,
      ownerId: device.ownerId,
      name: dto.name ?? null,
      status: RoutePlanStatus.PLANNED,
      provider: route.provider,
      profile: route.profile,
      originLat: dto.origin.lat,
      originLng: dto.origin.lng,
      destinationLat: dto.destination.lat,
      destinationLng: dto.destination.lng,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      encodedPolyline: route.encodedPolyline,
      deviationThresholdMeters:
        dto.deviationThresholdMeters ??
        Number(process.env.ROUTE_DEVIATION_DEFAULT_THRESHOLD_METERS || 50),
    });
    const saved = await this.routePlanRepository.save(plan);

    await this.routePlanRepository.query(
      `UPDATE route_plans SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) WHERE id = $2`,
      [JSON.stringify(route.geojson), saved.id],
    );

    return this.findOne(saved.id, requesterId, isAdmin);
  }

  async findAll(
    query: QueryRoutePlanDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<GetManyBaseResponseDto<EnrichedRoutePlan>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search = '',
      deviceId,
      status,
      from,
      to,
    } = query;
    const qb = this.routePlanRepository
      .createQueryBuilder('routePlan')
      .leftJoinAndSelect('routePlan.device', 'device')
      .addSelect('ST_AsGeoJSON(routePlan.geom)', 'route_plan_geom');

    if (!isAdmin) {
      qb.where('routePlan.ownerId = :requesterId', { requesterId });
    }

    if (search) {
      qb.andWhere('routePlan.name ILIKE :search', { search: `%${search}%` });
    }
    if (deviceId) {
      qb.andWhere('routePlan.deviceId = :deviceId', { deviceId });
    }
    if (status) {
      qb.andWhere('routePlan.status = :status', { status });
    }
    if (from) {
      qb.andWhere('routePlan.createdAt >= :from', { from });
    }
    if (to) {
      qb.andWhere('routePlan.createdAt <= :to', { to });
    }

    const { entities, raw } = await qb
      .orderBy(`routePlan.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();
    const total = await qb.getCount();

    return {
      data: entities.map((entity) => this.enrichRoutePlan(entity, raw)),
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedRoutePlan> {
    const routePlan = await this.routePlanRepository.findOne({
      where: { id },
      relations: ['device'],
    });
    if (!routePlan) throw new NotFoundException('Route plan not found');
    if (!isAdmin && routePlan.ownerId !== requesterId) {
      throw new ForbiddenException(
        'You do not have permission to access this route plan',
      );
    }

    const raw = await this.routePlanRepository.query<{ geom: string | null }[]>(
      `SELECT ST_AsGeoJSON(geom) as geom FROM route_plans WHERE id = $1`,
      [id],
    );

    return {
      ...routePlan,
      geom: this.parseLineString(raw[0]?.geom ?? null),
    };
  }

  async activate(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedRoutePlan> {
    const routePlan = await this.findOne(id, requesterId, isAdmin);
    if (
      routePlan.status === RoutePlanStatus.COMPLETED ||
      routePlan.status === RoutePlanStatus.CANCELLED
    ) {
      throw new ConflictException('Only planned routes can be activated');
    }

    await this.routePlanRepository.update(
      {
        deviceId: routePlan.deviceId,
        status: RoutePlanStatus.ACTIVE,
      },
      {
        status: RoutePlanStatus.CANCELLED,
        completedAt: new Date(),
      },
    );
    await this.routePlanRepository.update(id, {
      status: RoutePlanStatus.ACTIVE,
      activatedAt: new Date(),
      completedAt: null,
    });

    return this.findOne(id, requesterId, isAdmin);
  }

  async complete(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedRoutePlan> {
    await this.findOne(id, requesterId, isAdmin);
    await this.routePlanRepository.update(id, {
      status: RoutePlanStatus.COMPLETED,
      completedAt: new Date(),
    });
    return this.findOne(id, requesterId, isAdmin);
  }

  async cancel(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<EnrichedRoutePlan> {
    await this.findOne(id, requesterId, isAdmin);
    await this.routePlanRepository.update(id, {
      status: RoutePlanStatus.CANCELLED,
      completedAt: new Date(),
    });
    return this.findOne(id, requesterId, isAdmin);
  }

  async remove(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DefaultMessageResponseDto> {
    const routePlan = await this.findOne(id, requesterId, isAdmin);
    await this.routePlanRepository.softDelete(routePlan.id);
    return { message: 'Route plan deleted successfully' };
  }

  private enrichRoutePlan(entity: RoutePlan, raw: unknown[]): EnrichedRoutePlan {
    const rows = raw as { routePlan_id?: string; route_plan_geom?: string | null }[];
    const row = rows.find((item) => item.routePlan_id === entity.id);
    return {
      ...entity,
      geom: this.parseLineString(row?.route_plan_geom ?? null),
    };
  }

  private parseLineString(geom: string | null): GeoJSONLineString | null {
    if (!geom) return null;
    try {
      const parsed = JSON.parse(geom) as GeoJSONLineString;
      if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
