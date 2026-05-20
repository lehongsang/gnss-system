import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MediaLog, MediaLogType } from './entities/media-log.entity';
import { MediaStatus } from '@/services/storage/entities/media.entity';
import { GetMediaLogsQueryDto } from './dtos/media-log.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { getManyResponse } from '@/utils/getManyResponse';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';

@Injectable()
export class MediaLogsService {
  constructor(
    @InjectRepository(MediaLog)
    private readonly mediaLogRepo: Repository<MediaLog>,
  ) {}

  async findAll(query: GetMediaLogsQueryDto): Promise<GetManyBaseResponseDto<MediaLog>> {
    const { page, limit, deviceId, mediaType, from, to, sortBy, sortOrder } = query;
    const where: Record<string, unknown> = {};

    if (deviceId) where.deviceId = deviceId;
    if (mediaType) where.mediaType = mediaType;
    if (from && to) where.startTime = Between(new Date(from), new Date(to));

    const allowedSort = ['startTime', 'createdAt', 'endTime'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'startTime';

    const [data, total] = await this.mediaLogRepo.findAndCount({
      where,
      order: { [safeSortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    return getManyResponse({ query, data, total });
  }

  async findOne(id: string): Promise<MediaLog> {
    const log = await this.mediaLogRepo.findOne({ where: { id } });
    if (!log) throw new NotFound(`MediaLog ${id} not found`);
    return log;
  }

  /**
   * Create a media log record after a successful presigned URL upload.
   *
   * Called when the client confirms that it has finished uploading
   * the file directly to SeaweedFS via the presigned URL.
   */
  async createFromUpload(params: {
    deviceId: string;
    fileKey: string;
    fileUrl: string;
    timestamp?: string;
    lat?: number;
    lng?: number;
  }): Promise<MediaLog> {
    const filename = params.fileKey.split('/').pop() || params.fileKey;
    const startTime = params.timestamp ? new Date(params.timestamp) : new Date();

    const mediaLog = this.mediaLogRepo.create({
      deviceId: params.deviceId,
      filename,
      originalName: filename,
      mimeType: 'image/jpeg',
      size: 0,  // Size unknown in presigned URL flow (file bypasses backend)
      s3Key: params.fileKey,
      url: params.fileUrl,
      status: MediaStatus.COMPLETED,
      startTime,
      mediaType: MediaLogType.IMAGE_FRAME,
    });

    return this.mediaLogRepo.save(mediaLog);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.mediaLogRepo.delete(id);
  }
}

