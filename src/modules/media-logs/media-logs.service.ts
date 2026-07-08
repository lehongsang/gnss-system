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
   * Lấy danh sách media log có phân trang.
   * User không phải admin chỉ xem được log của thiết bị mình sở hữu,
   * dùng INNER JOIN thay vì query thiết bị riêng để tránh N+1.
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

    // User thường: join thẳng với bảng device để lọc theo quyền sở hữu trong 1 query duy nhất
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
   * Lấy một media log theo ID, có kiểm tra quyền sở hữu.
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
   * Tạo presigned URL có thời hạn ngắn để stream/tải media an toàn.
   * Dùng s3Key lưu trong MediaLog để sinh URL GET có hạn qua StorageService,
   * thay vì trả về URL tĩnh (không truy cập được vì bucket private).
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

    // Sinh presigned GET URL có hiệu lực 1 giờ (3600s)
    const presignedUrl = await this.storageService.getPresignedUrl(s3KeyToUse);
    if (!presignedUrl) {
      throw new NotFoundException(
        `Unable to generate stream URL for ${type} media`,
      );
    }

    return { url: presignedUrl };
  }

  /**
   * Gửi yêu cầu xử lý Optical Flow bất đồng bộ tới AI worker thông qua Kafka
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

    // Đẩy job xử lý sang Kafka để AI worker xử lý bất đồng bộ
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
   * Tạo một bản ghi media log mới.
   */
  async create(data: Partial<MediaLog>): Promise<MediaLog> {
    const log = this.mediaLogRepository.create(data);
    return this.mediaLogRepository.save(log);
  }

  // ─── Luồng upload qua Presigned URL (Out-of-band) ───────────────────────────────

  /**
   * Sinh presigned PUT URL để thiết bị upload media thẳng lên S3.
   *
   * Đây là pattern "Out-of-band Upload":
   * 1. Thiết bị gọi REST API nhẹ này để xin presigned URL
   * 2. Thiết bị upload file nhị phân trực tiếp lên S3 bằng HTTP PUT
   * 3. Thiết bị xác nhận đã upload xong qua confirmUpload()
   *
   * Ưu điểm so với pipeline Base64/MQTT cũ:
   * - Không bị giới hạn payload size của MQTT broker
   * - Không tốn overhead encode Base64 (phình thêm ~33% dung lượng)
   * - Không làm phình message Kafka
   * - Hỗ trợ resume khi mạng bị ngắt giữa chừng (HTTP range request)
   *
   * @param dto - Chứa deviceId, đuôi file, và tên file tuỳ chọn
   * @returns Presigned upload URL, s3Key và thời gian hết hạn
   */
  async requestUploadUrl(dto: RequestUploadUrlDto): Promise<{
    uploadUrl: string;
    s3Key: string;
    mimeType: string;
    expiresIn: number;
  }> {
    // Bước 1: Kiểm tra thiết bị có tồn tại trong hệ thống
    await this.devicesService.findOneById(dto.deviceId);

    // Bước 2: Xác định MIME type dựa vào đuôi file
    const mimeType = EXTENSION_MIME_MAP[dto.fileExtension];

    // Bước 3: Build S3 object key
    const baseName = dto.filename || `${Date.now()}-${dto.deviceId}`;
    const filename = `${baseName}.${dto.fileExtension}`;
    const s3Key = `media-logs/${dto.deviceId}/${filename}`;

    // Bước 4: Sinh presigned PUT URL (hiệu lực 1 giờ)
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
   * Hook khởi tạo module của NestJS.
   * Chạy một interval kiểu cron ở background để quét dọn file rác trên S3.
   */
  async onModuleInit() {
    // Đảm bảo cột geom (PostGIS) tồn tại trên bảng media_logs, tự tạo nếu thiếu
    try {
      await this.mediaLogRepository.query(`
        ALTER TABLE media_logs ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
        CREATE INDEX IF NOT EXISTS idx_media_logs_geom ON media_logs USING GIST (geom);
      `);
    } catch (err) {
      this.logger.error('Failed to verify media_logs geom column in onModuleInit:', err);
    }

    // Không schedule interval khi chạy test để tránh Jest bị leak open handle
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Quét dọn lần đầu sau 30s kể từ lúc boot, sau đó lặp lại mỗi 24 giờ
    setTimeout(() => {
      this.cleanupOrphanedFiles().catch(() => {});
    }, 30000);
    setInterval(() => {
      this.cleanupOrphanedFiles().catch(() => {});
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Xác nhận thiết bị đã upload thành công file media lên S3
   * bằng presigned URL lấy từ requestUploadUrl().
   *
   * Kiểm tra chặt chẽ file có thực sự tồn tại (qua S3 HeadObject) và validate kích thước.
   *
   * @param dto - Chứa deviceId, s3Key (lấy từ requestUploadUrl) và mediaType
   * @returns Bản ghi MediaLog vừa được tạo
   */
  async confirmUpload(dto: ConfirmUploadDto): Promise<MediaLog> {
    // Bước 1: Kiểm tra thiết bị tồn tại
    await this.devicesService.findOneById(dto.deviceId);

    // Bước 2: Lấy metadata của object trên S3 để xác nhận file đã được upload thật và kiểm tra size
    const s3Meta = await this.storageService.getObjectMetadata(dto.s3Key);
    if (!s3Meta) {
      throw new NotFoundException(
        'Uploaded file was not found in storage. Please complete the S3 upload before confirming.',
      );
    }

    // Bước 3: Giới hạn kích thước file tối đa
    // Ảnh tối đa 10MB, video tối đa 100MB
    const maxLimit =
      dto.mediaType === ConfirmMediaType.IMAGE
        ? 10 * 1024 * 1024 // 10MB
        : 100 * 1024 * 1024; // 100MB

    if (s3Meta.size > maxLimit) {
      // File vượt quá giới hạn thì xoá luôn khỏi S3 để tránh rác
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

    // Bước 4: Map media type đơn giản từ DTO sang enum của entity
    const mappedMediaType =
      dto.mediaType === ConfirmMediaType.IMAGE
        ? MediaType.IMAGE_FRAME
        : MediaType.VIDEO_CHUNK;

    // Bước 5: Xác định toạ độ (lấy trực tiếp từ DTO, nếu không có thì fallback sang telemetry gần nhất)
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

    // Bước 6: Tạo và lưu bản ghi media log
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

    // Có toạ độ thì mới cập nhật cột geom (PostGIS) để phục vụ query theo vị trí
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
   * Helper tìm toạ độ telemetry gần nhất với một mốc thời gian cho trước.
   * Quét 1 điểm trước và 1 điểm sau mốc thời gian đó, rồi chọn điểm nào gần hơn.
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
   * Lấy các media log có toạ độ địa lý (lat khác null) trong một khoảng thời gian.
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
   * Quét toàn bộ file trong prefix "media-logs/" trên S3, tìm những file cũ hơn 24h
   * mà không có bản ghi tương ứng trong bảng `media_logs`, rồi xoá chúng.
   *
   * LƯU Ý: Phải kiểm tra CẢ `s3Key` (file gốc) lẫn `processedS3Key` (kết quả AI xử lý
   * optical flow), vì file AI cũng được lưu cùng prefix trên S3 — nếu chỉ check s3Key
   * sẽ xoá nhầm file kết quả AI.
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

        // Chỉ xử lý file cũ hơn 24 giờ, tránh xoá nhầm file vừa upload
        if (obj.LastModified > oneDayAgo) continue;

        // Kiểm tra key này có khớp với:
        // 1. Key upload gốc (s3Key), hoặc
        // 2. Key kết quả AI xử lý (processedS3Key)
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

