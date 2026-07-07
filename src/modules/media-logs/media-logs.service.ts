import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
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
import { KafkaService } from '@/services/kafka/kafka.service';
import { KafkaTopic } from '@/services/kafka/kafka.enum';
import {
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class MediaLogsService implements OnModuleInit {
  private readonly logger = new LoggerService(MediaLogsService.name);

  constructor(
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
    private readonly devicesService: DevicesService,
    private readonly storageService: StorageService,
    private readonly alertsService: AlertsService,
    private readonly kafkaService: KafkaService,
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
    type: 'raw' | 'processed' = 'raw',
  ): Promise<{ url: string }> {
    const log = await this.findOne(id, requesterId, isAdmin);

    const s3KeyToUse = type === 'processed' ? log.processedS3Key : log.s3Key;

    if (!s3KeyToUse) {
      if (type === 'processed') {
        throw new NotFoundException('Processed video not found or not yet analyzed by AI');
      }
      throw new NotFoundException('Media S3 key not found');
    }

    if (type === 'raw' && log.s3Key && log.s3Key.startsWith('mock/') && log.fileUrl) {
      return { url: log.fileUrl };
    }

    // Generate a presigned GET URL valid for 1 hour (3600s)
    const presignedUrl = await this.storageService.getPresignedUrl(s3KeyToUse);
    if (!presignedUrl) {
      throw new NotFoundException(
        `Unable to generate stream URL for ${type} media`,
      );
    }

    return { url: presignedUrl };
  }

  /**
   * Request asynchronous Optical Flow processing using the local AI worker via Kafka
   */
  async requestOpticalFlowAnalysis(
    id: string,
    requesterId: string,
    isAdmin: boolean,
    mode: 'VECTORS' | 'HEATMAP' = 'VECTORS',
    isMoving = true,
  ): Promise<{ jobId: string; status: string }> {
    const log = await this.findOne(id, requesterId, isAdmin);

    if (log.mediaType !== MediaType.VIDEO_CHUNK) {
      throw new BadRequestException('Only video logs can be processed with Optical Flow');
    }

    log.processingStatus = 'pending';
    log.processingError = null;
    await this.mediaLogRepository.save(log);

    // Send processing request to Kafka
    const jobPayload = {
      jobId: log.id,
      deviceId: log.deviceId,
      inputS3Key: log.s3Key,
      mode: mode,
      isMoving: isMoving,
    };

    try {
      await this.kafkaService.produce(KafkaTopic.GNSS_MEDIA_PROCESS_JOB, [
        {
          key: log.id,
          value: JSON.stringify(jobPayload),
        },
      ]);
      this.logger.log(`Published optical flow job request to Kafka for MediaLog ${log.id}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to publish optical flow job to Kafka for MediaLog ${log.id}`, err);
      log.processingStatus = 'failed';
      log.processingError = `Kafka produce error: ${errMsg}`;
      await this.mediaLogRepository.save(log);
      throw err;
    }

    return { jobId: log.id, status: 'pending' };
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
   * NestJS module initialization hook.
   * Starts a background cron-like interval sweeping S3 bucket for orphaned files.
   */
  async onModuleInit() {
    // Ensure PostGIS geom column exists on media_logs
    try {
      await this.mediaLogRepository.query(`
        ALTER TABLE media_logs ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
        CREATE INDEX IF NOT EXISTS idx_media_logs_geom ON media_logs USING GIST (geom);
      `);
    } catch (err) {
      this.logger.error('Failed to verify media_logs geom column in onModuleInit:', err);
    }

    // Do not schedule intervals during test runs to prevent Jest open handles leak
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Run sweep clean-up 30s after boot, and then every 24 hours
    setTimeout(() => {
      this.cleanupOrphanedFiles().catch(() => {});
    }, 30000);
    setInterval(() => {
      this.cleanupOrphanedFiles().catch(() => {});
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Confirms that a device has successfully uploaded a media file to S3
   * using the presigned URL from requestUploadUrl().
   *
   * Enforces strict file existence check via S3 HeadObject and size limit validations.
   *
   * @param dto - Contains deviceId, s3Key (from requestUploadUrl), and mediaType
   * @returns The newly created MediaLog record
   */
  async confirmUpload(dto: ConfirmUploadDto): Promise<MediaLog> {
    // Step 1: Verify the device exists
    await this.devicesService.findOneById(dto.deviceId);

    // Step 2: Query S3 object metadata to verify the file was actually uploaded and check its size
    const s3Meta = await this.storageService.getObjectMetadata(dto.s3Key);
    if (!s3Meta) {
      throw new NotFoundException(
        'Uploaded file was not found in storage. Please complete the S3 upload before confirming.',
      );
    }

    // Step 3: Enforce strict file size limits
    // Max 10MB for images, Max 100MB for videos
    const maxLimit =
      dto.mediaType === ConfirmMediaType.IMAGE
        ? 10 * 1024 * 1024 // 10MB
        : 100 * 1024 * 1024; // 100MB

    if (s3Meta.size > maxLimit) {
      // Clean up the violating file from S3 immediately
      try {
        const s3Client = this.storageService.getS3Client();
        const bucket = this.storageService.getBucket();
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: dto.s3Key,
          }),
        );
      } catch (err) {
        this.logger.error(`Failed to delete over-sized file: ${dto.s3Key}`, err);
      }

      throw new BadRequestException(
        `Uploaded file size (${(s3Meta.size / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum allowed limit for ${dto.mediaType} (${maxLimit / (1024 * 1024)}MB). File has been deleted.`,
      );
    }

    // Step 4: Map the simple media type to the entity enum
    const mappedMediaType =
      dto.mediaType === ConfirmMediaType.IMAGE
        ? MediaType.IMAGE_FRAME
        : MediaType.VIDEO_CHUNK;

    // Step 5: Determine coordinates (Directly from DTO or fallback to closest telemetry)
    let lat = dto.lat ?? null;
    let lng = dto.lng ?? null;
    const startTime = new Date();

    if (lat === null || lng === null) {
      const closest = await this.findClosestTelemetry(dto.deviceId, startTime);
      if (closest) {
        lat = closest.lat;
        lng = closest.lng;
      }
    }

    // Step 6: Create and persist the media log record
    const log = this.mediaLogRepository.create({
      deviceId: dto.deviceId,
      mediaType: mappedMediaType,
      startTime,
      endTime: startTime,
      s3Key: dto.s3Key,
      fileUrl: '',
      snapshotId: dto.snapshotId ?? null,
      lat,
      lng,
    });

    const savedLog = await this.mediaLogRepository.save(log);

    // If coordinates are available, update the PostGIS geom column
    if (lat !== null && lng !== null) {
      await this.mediaLogRepository.query(
        `UPDATE media_logs SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        [lng, lat, savedLog.id]
      );
    }

    if (dto.snapshotId && mappedMediaType === MediaType.IMAGE_FRAME) {
      await this.alertsService.linkSnapshotMedia(
        dto.deviceId,
        dto.snapshotId,
        savedLog.id,
      );
    }

    if (mappedMediaType === MediaType.VIDEO_CHUNK) {
      this.requestOpticalFlowAnalysis(savedLog.id, savedLog.deviceId, true).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to auto-trigger optical flow analysis for media log ${savedLog.id}: ${errMsg}`);
      });
    }

    this.logger.log(
      `Media upload confirmed for device ${dto.deviceId}: ${dto.s3Key} (Size: ${(s3Meta.size / 1024).toFixed(1)} KB, Type: ${dto.mediaType})`,
    );

    return savedLog;
  }

  /**
   * Private helper to find the telemetry coordinate closest to a given timestamp.
   * Performs index-scans for points before and after, then returns the closest one.
   */
  private async findClosestTelemetry(
    deviceId: string,
    time: Date,
  ): Promise<{ lat: number; lng: number } | null> {
    const formattedTime = time.toISOString();

    interface TelemetryPoint {
      lat: number;
      lng: number;
      timestamp: string | Date;
    }

    const before = await this.mediaLogRepository.query<TelemetryPoint[]>(
      `SELECT lat, lng, timestamp FROM telemetry 
       WHERE device_id = $1 AND timestamp <= $2 
       ORDER BY timestamp DESC LIMIT 1`,
      [deviceId, formattedTime],
    );

    const after = await this.mediaLogRepository.query<TelemetryPoint[]>(
      `SELECT lat, lng, timestamp FROM telemetry 
       WHERE device_id = $1 AND timestamp > $2 
       ORDER BY timestamp ASC LIMIT 1`,
      [deviceId, formattedTime],
    );

    const recordBefore = before[0];
    const recordAfter = after[0];

    if (!recordBefore && !recordAfter) {
      return null;
    }

    if (!recordBefore && recordAfter) {
      return { lat: recordAfter.lat, lng: recordAfter.lng };
    }

    if (!recordAfter && recordBefore) {
      return { lat: recordBefore.lat, lng: recordBefore.lng };
    }

    if (recordBefore && recordAfter) {
      const diffBefore = Math.abs(time.getTime() - new Date(recordBefore.timestamp).getTime());
      const diffAfter = Math.abs(new Date(recordAfter.timestamp).getTime() - time.getTime());

      if (diffBefore <= diffAfter) {
        return { lat: recordBefore.lat, lng: recordBefore.lng };
      } else {
        return { lat: recordAfter.lat, lng: recordAfter.lng };
      }
    }

    return null;
  }

  /**
   * Retrieves media logs with geographical coordinates (lat IS NOT NULL) within a time range.
   */
  async findMapPins(
    query: { deviceId?: string; from?: string; to?: string },
    requesterId: string,
    isAdmin: boolean,
  ): Promise<MediaLog[]> {
    const { deviceId, from, to } = query;
    const qb = this.mediaLogRepository.createQueryBuilder('mediaLog');

    qb.where('mediaLog.lat IS NOT NULL');

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
        qb.andWhere('mediaLog.deviceId = :deviceId', { deviceId });
      }
    }

    if (from) qb.andWhere('mediaLog.startTime >= :from', { from });
    if (to) qb.andWhere('mediaLog.startTime <= :to', { to });

    return qb.orderBy('mediaLog.startTime', 'DESC').getMany();
  }

  /**
   * Sweeps the S3 bucket's "media-logs/" prefix, identifying files older than 24 hours
   * that have no corresponding database record in the `media_logs` table, and deletes them.
   *
   * NOTE: This check must verify BOTH `s3Key` (original upload) and `processedS3Key`
   * (AI-processed/optical flow results) to avoid deleting AI analysis files that are
   * saved under the same prefix in the S3 bucket.
   */
  async cleanupOrphanedFiles(): Promise<void> {
    this.logger.log('Starting orphaned media files sweep clean-up...');
    try {
      const s3Client = this.storageService.getS3Client();
      const bucket = this.storageService.getBucket();

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'media-logs/',
      });
      const response = await s3Client.send(command);
      const objects = response.Contents || [];

      let deletedCount = 0;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const obj of objects) {
        if (!obj.Key || !obj.LastModified) continue;

        // Only target files older than 24 hours
        if (obj.LastModified > oneDayAgo) continue;

        // Query database to see if the file key matches either:
        // 1. The original upload key (s3Key)
        // 2. The AI-processed output key (processedS3Key)
        const dbRecord = await this.mediaLogRepository.findOne({
          where: [
            { s3Key: obj.Key },
            { processedS3Key: obj.Key },
          ],
        });

        if (!dbRecord) {
          this.logger.warn(
            `Orphaned media file detected in S3: ${obj.Key} (LastModified: ${obj.LastModified.toISOString()}). Deleting...`,
          );
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: obj.Key,
            }),
          );
          deletedCount++;
        }
      }

      this.logger.log(
        `Orphaned media files sweep completed. Deleted ${deletedCount} orphaned file(s).`,
      );
    } catch (error) {
      this.logger.error('Failed to run orphaned files sweep clean-up', error);
    }
  }
}

