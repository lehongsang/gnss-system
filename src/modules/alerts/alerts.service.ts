import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { AlertQueryDto } from './dtos/query-alert.dto';
import { CreateAlertDto } from './dtos/create-alert.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { MediaLog, MediaType } from '@/modules/media-logs/entities/media-log.entity';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
    private readonly devicesService: DevicesService,
  ) {}

  /**
   * Retrieves a paginated list of alerts.
   * Non-admin users are restricted to alerts from devices they own,
   * using an INNER JOIN instead of a separate device query (avoids N+1 anti-pattern).
   */
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

    // For non-admin, join the device so dashboard clients can display device names.
    if (!isAdmin) {
      qb.innerJoinAndSelect('alert.device', 'device')
        .andWhere('device.ownerId = :requesterId', { requesterId });

      if (deviceId) {
        qb.andWhere('alert.deviceId = :deviceId', { deviceId });
      }
    } else {
      // Admin: include device + owner relations for resource management
      qb.leftJoinAndSelect('alert.device', 'device')
        .leftJoinAndSelect('device.owner', 'owner');

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

  /**
   * Retrieves a single alert by ID with ownership check.
   */
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

  /**
   * Marks an alert as resolved.
   */
  async resolve(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Alert> {
    const alert = await this.findOne(id, requesterId, isAdmin);
    alert.isResolved = true;
    return this.alertRepository.save(alert);
  }

  /**
   * Creates a new alert record (used by AlertsConsumer from Kafka pipeline).
   */
  async create(dto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create(dto);
    return this.alertRepository.save(alert);
  }

  /**
   * Finds the latest image media log that shares the same device and snapshot correlation ID.
   */
  async findSnapshotMediaLog(
    deviceId: string,
    snapshotId: string,
  ): Promise<MediaLog | null> {
    return this.mediaLogRepository.findOne({
      where: {
        deviceId,
        snapshotId,
        mediaType: MediaType.IMAGE_FRAME,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Links an existing alert to a snapshot image when both share a correlation ID.
   */
  async linkSnapshotMedia(
    deviceId: string,
    snapshotId: string,
    mediaLogId: string,
  ): Promise<void> {
    await this.alertRepository.update(
      {
        deviceId,
        snapshotId,
        snapshotMediaLogId: IsNull(),
      },
      { snapshotMediaLogId: mediaLogId },
    );
  }
}
