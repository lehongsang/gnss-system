import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { AlertQueryDto } from './dtos/query-alert.dto';
import { CreateAlertDto } from './dtos/create-alert.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import {
  GetManyBaseResponseDto,
  SortOrder,
} from '@/commons/dtos/get-many-base.dto';

@Injectable()
export class AlertsService implements OnModuleInit {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    private readonly devicesService: DevicesService,
  ) {}

  onModuleInit() {
    // TODO: Subscribe to 'gnss.alerts' Kafka topic
  }

  async findAll(
    query: AlertQueryDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<GetManyBaseResponseDto<Alert>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      deviceId,
      alertType,
      isResolved,
    } = query;
    const qb = this.alertRepository.createQueryBuilder('alert');

    // For non-admin, restrict to alerts of devices owned by the requester
    if (!isAdmin) {
      // Find all user's devices
      const myDevices = await this.devicesService.findMine(requesterId, {
        page: 1,
        limit: 1000,
        sortBy: 'createdAt',
        sortOrder: SortOrder.DESC,
      });
      const myDeviceIds = myDevices.data.map((d) => d.id);

      if (myDeviceIds.length === 0) {
        return { data: [], total: 0, page, limit, pageCount: 0 };
      }

      qb.where('alert.deviceId IN (:...myDeviceIds)', { myDeviceIds });

      if (deviceId) {
        if (!myDeviceIds.includes(deviceId))
          throw new ForbiddenException('You do not own this device');
        qb.andWhere('alert.deviceId = :deviceId', { deviceId });
      }
    } else {
      if (deviceId) {
        qb.where('alert.deviceId = :deviceId', { deviceId });
      }
    }

    if (alertType) qb.andWhere('alert.alertType = :alertType', { alertType });
    if (isResolved !== undefined)
      qb.andWhere('alert.isResolved = :isResolved', { isResolved });

    const [data, total] = await qb
      .orderBy(`alert.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Alert> {
    const alert = await this.alertRepository.findOne({
      where: { id },
      relations: ['device'],
    });
    if (!alert) throw new NotFoundException('Alert not found');

    if (!isAdmin) {
      if (alert.device.ownerId !== requesterId) {
        throw new ForbiddenException(
          'You do not have permission to access this alert',
        );
      }
    }

    return alert;
  }

  async resolve(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Alert> {
    const alert = await this.findOne(id, requesterId, isAdmin);
    alert.isResolved = true;
    return this.alertRepository.save(alert);
  }

  async create(dto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create(dto);
    return this.alertRepository.save(alert);
  }
}
