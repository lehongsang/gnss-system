import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaLog } from './entities/media-log.entity';
import { MediaLogQueryDto } from './dtos/query-media-log.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import {
  GetManyBaseResponseDto,
  SortOrder,
} from '@/commons/dtos/get-many-base.dto';

@Injectable()
export class MediaLogsService implements OnModuleInit {
  constructor(
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
    private readonly devicesService: DevicesService,
  ) {}

  async onModuleInit() {}

  async findAll(
    query: MediaLogQueryDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<GetManyBaseResponseDto<MediaLog>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      deviceId,
      mediaType,
      from,
      to,
    } = query;
    const qb = this.mediaLogRepository.createQueryBuilder('mediaLog');

    // For non-admin, restrict to logs of devices owned by the requester
    if (!isAdmin) {
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

      qb.where('mediaLog.deviceId IN (:...myDeviceIds)', { myDeviceIds });

      if (deviceId) {
        if (!myDeviceIds.includes(deviceId))
          throw new ForbiddenException('You do not own this device');
        qb.andWhere('mediaLog.deviceId = :deviceId', { deviceId });
      }
    } else {
      if (deviceId) {
        qb.where('mediaLog.deviceId = :deviceId', { deviceId });
      }
    }

    if (mediaType)
      qb.andWhere('mediaLog.mediaType = :mediaType', { mediaType });
    if (from) qb.andWhere('mediaLog.startTime >= :from', { from });
    if (to) qb.andWhere('mediaLog.startTime <= :to', { to });

    const [data, total] = await qb
      .orderBy(`mediaLog.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<MediaLog> {
    const log = await this.mediaLogRepository.findOne({
      where: { id },
      relations: ['device'],
    });
    if (!log) throw new NotFoundException('Media log not found');

    if (!isAdmin) {
      if (log.device.ownerId !== requesterId) {
        throw new ForbiddenException(
          'You do not have permission to access this log',
        );
      }
    }

    return log;
  }

  async getStreamUrl(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<{ url: string }> {
    const log = await this.findOne(id, requesterId, isAdmin);
    // Placeholder. In reality, generate presigned URL from StorageService or S3 client
    return { url: log.fileUrl };
  }

  async create(data: Partial<MediaLog>): Promise<MediaLog> {
    const log = this.mediaLogRepository.create(data);
    return this.mediaLogRepository.save(log);
  }
}
