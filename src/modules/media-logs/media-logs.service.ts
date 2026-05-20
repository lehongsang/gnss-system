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
import {
  RequestUploadUrlDto,
  EXTENSION_MIME_MAP,
} from './dtos/request-upload-url.dto';
import { ConfirmUploadDto, ConfirmMediaType } from './dtos/confirm-upload.dto';
import { MediaType } from './entities/media-log.entity';
import { LoggerService } from '@/commons/logger/logger.service';
import { AlertsService } from '@/modules/alerts/alerts.service';

@Injectable()
export class MediaLogsService {
  private readonly logger = new LoggerService(MediaLogsService.name);

  constructor(
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
    private readonly devicesService: DevicesService,
    private readonly storageService: StorageService,
    private readonly alertsService: AlertsService,
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

    if (log.s3Key && log.s3Key.startsWith('mock/') && log.fileUrl) {
      return { url: log.fileUrl };
    }

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

  // ─── Presigned URL Upload Flow (Out-of-band) ───────────────────────────────

  /**
   * Generates a presigned PUT URL for direct-to-S3 media upload.
   *
   * This implements the "Out-of-band Upload" pattern:
   * 1. Device requests a presigned URL via this lightweight REST call
   * 2. Device uploads the raw binary file directly to S3 using HTTP PUT
   * 3. Device confirms the upload via confirmUpload()
   *
   * Benefits over the Base64/MQTT pipeline:
   * - No payload size limitation from MQTT broker
   * - No Base64 encoding overhead (33% size inflation)
   * - No Kafka message bloat
   * - Supports resume on network interruption (HTTP range requests)
   *
   * @param dto - Contains deviceId, file extension, and optional custom filename
   * @returns Object containing the presigned upload URL, s3Key, and expiration time
   */
  async requestUploadUrl(dto: RequestUploadUrlDto): Promise<{
    uploadUrl: string;
    s3Key: string;
    mimeType: string;
    expiresIn: number;
  }> {
    // Step 1: Verify the device exists in the system
    await this.devicesService.findOneById(dto.deviceId);

    // Step 2: Resolve MIME type from the file extension
    const mimeType = EXTENSION_MIME_MAP[dto.fileExtension];

    // Step 3: Build the S3 object key
    const baseName = dto.filename || `${Date.now()}-${dto.deviceId}`;
    const filename = `${baseName}.${dto.fileExtension}`;
    const s3Key = `media-logs/${dto.deviceId}/${filename}`;

    // Step 4: Generate the presigned PUT URL (valid for 1 hour)
    const expiresIn = 3600;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      s3Key,
      mimeType,
      expiresIn,
    );

    this.logger.log(
      `Presigned upload URL generated for device ${dto.deviceId}: ${s3Key}`,
    );

    return { uploadUrl, s3Key, mimeType, expiresIn };
  }

  /**
   * Confirms that a device has successfully uploaded a media file to S3
   * using the presigned URL from requestUploadUrl().
   *
   * This creates the MediaLog database record, completing the upload lifecycle.
   * The record links the device to the S3 object key so the file can be
   * retrieved later via presigned GET URLs.
   *
   * @param dto - Contains deviceId, s3Key (from requestUploadUrl), and mediaType
   * @returns The newly created MediaLog record
   */
  async confirmUpload(dto: ConfirmUploadDto): Promise<MediaLog> {
    // Step 1: Verify the device exists
    await this.devicesService.findOneById(dto.deviceId);

    // Step 2: Map the simple media type to the entity enum
    const mappedMediaType =
      dto.mediaType === ConfirmMediaType.IMAGE
        ? MediaType.IMAGE_FRAME
        : MediaType.VIDEO_CHUNK;

    // Step 3: Create and persist the media log record
    const log = this.mediaLogRepository.create({
      deviceId: dto.deviceId,
      mediaType: mappedMediaType,
      startTime: new Date(),
      endTime: new Date(),
      s3Key: dto.s3Key,
      fileUrl: '',
      snapshotId: dto.snapshotId ?? null,
    });

    const savedLog = await this.mediaLogRepository.save(log);
    if (dto.snapshotId && mappedMediaType === MediaType.IMAGE_FRAME) {
      await this.alertsService.linkSnapshotMedia(
        dto.deviceId,
        dto.snapshotId,
        savedLog.id,
      );
    }

    this.logger.log(
      `Media upload confirmed for device ${dto.deviceId}: ${dto.s3Key} (${dto.mediaType})`,
    );

    return savedLog;
  }
}

