import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MediaLog } from './entities/media-log.entity';
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

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.mediaLogRepo.delete(id);
  }
}
