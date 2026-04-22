import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaLog } from './entities/media-log.entity';
import { MediaLogQueryDto } from './dtos/query-media-log.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { StorageService } from '@/services/storage/storage.service';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { Device } from '@/modules/devices/entities/device.entity';

@Injectable()
export class MediaLogsService {
  constructor(
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
    private readonly devicesService: DevicesService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Retrieves a paginated list of media logs.
   * Non-admin users are restricted to logs from devices they own,
   * using an INNER JOIN instead of a separate device query (avoids N+1 anti-pattern).
   */
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

    // For non-admin, use INNER JOIN to filter by device ownership in one query
    if (!isAdmin) {
      qb.innerJoin(
        Device,
        'd',
        'd.id = mediaLog.deviceId AND d.ownerId = :requesterId',
        { requesterId },
      );

      if (deviceId) {
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

  /**
   * Retrieves a single media log by ID with ownership check.
   */
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

  /**
   * Generates a short-lived presigned URL for secure media streaming/download.
   * Uses the s3Key stored on the MediaLog record to generate a time-limited GET URL
   * via StorageService, instead of returning a static (inaccessible) file URL.
   */
  async getStreamUrl(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<{ url: string }> {
    const log = await this.findOne(id, requesterId, isAdmin);

    // Generate a presigned GET URL valid for 1 hour (3600s)
    const presignedUrl = await this.storageService.getPresignedUrl(log.s3Key);
    if (!presignedUrl) {
      throw new NotFoundException(
        'Unable to generate stream URL — media file may have been deleted from storage',
      );
    }

    return { url: presignedUrl };
  }

  /**
   * Creates a new media log record.
   */
  async create(data: Partial<MediaLog>): Promise<MediaLog> {
    const log = this.mediaLogRepository.create(data);
    return this.mediaLogRepository.save(log);
  }
}

