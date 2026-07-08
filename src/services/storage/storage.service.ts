import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media } from './entities/media.entity';
import { MediaStatus, StoragePath } from '@/services/storage/storage.enums';
import { KafkaService } from '../kafka/kafka.service';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import * as path from 'path';
import { KafkaTopic } from '@/services/kafka/kafka.enum';
import { StorageFileQueryDto } from './dtos/query-file.dto';
import { MediaLog, MediaType } from '@/modules/media-logs/entities/media-log.entity';
import { Device } from '@/modules/devices/entities/device.entity';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private signingClient: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>('S3_BUCKET', 'medias')!;

    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const externalUrl =
      this.configService.get<string>('S3_EXTERNAL_URL') || endpoint;
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY', '');
    const forcePathStyle =
      this.configService.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false';

    const commonConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };

    // Client nội bộ dùng endpoint internal (vd: tên service trong docker network)
    this.s3Client = new S3Client({
      ...commonConfig,
      endpoint: (endpoint as string) || undefined,
    });

    // Client ký presigned URL phải dùng endpoint mà client bên ngoài (browser/device)
    // truy cập được, nếu không URL trả về sẽ trỏ vào địa chỉ nội bộ không gọi được
    this.signingClient = new S3Client({
      ...commonConfig,
      endpoint: (externalUrl as string) || undefined,
    });
  }

  getS3Client(): S3Client {
    return this.s3Client;
  }

  getBucket(): string {
    return this.bucket;
  }


  async uploadFile(
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    isSync = true,
    folder: string | StoragePath = StoragePath.UPLOADS,
  ) {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');

    if (!file.mimetype.startsWith('image/')) {
      throw new Error('Only image files are allowed');
    }

    // Resize + convert sang webp để giảm dung lượng lưu trữ, giữ nguyên tỉ lệ
    // và không phóng to ảnh nhỏ hơn kích thước giới hạn
    const processedBuffer = await sharp(file.buffer)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    const originalNameWithoutExt = path.parse(file.originalname).name;
    const filename = `${Date.now()}-${originalNameWithoutExt}.webp`;
    const key = cleanFolder ? `${cleanFolder}/${filename}` : filename;
    const mimeType = 'image/webp';

    const media = this.mediaRepository.create({
      filename,
      originalName: file.originalname,
      mimeType: mimeType,
      size: processedBuffer.length,
      status: MediaStatus.PENDING,
      s3Key: key,
      url: '',
    });

    const savedMedia = await this.mediaRepository.save(media);

    // isSync=true: upload lên S3 ngay và chờ kết quả (dùng cho file nhỏ, cần trả về ngay)
    if (isSync) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: processedBuffer,
            ContentType: mimeType,
          }),
        );

        await this.mediaRepository.update(savedMedia.id, {
          status: MediaStatus.COMPLETED,
        });

        const completedMedia = Object.assign(savedMedia, {
          status: MediaStatus.COMPLETED,
          url: (await this.getPresignedUrl(key)) || '',
        });
        return completedMedia;
      } catch (error) {
        this.logger.error(`Synchronous upload failed for ${filename}`, error);
        await this.mediaRepository.update(savedMedia.id, {
          status: MediaStatus.FAILED,
        });
        throw error;
      }
    } else {
      // isSync=false: trả về ngay presigned URL, việc upload thật sự sẽ được
      // StorageConsumer xử lý bất đồng bộ qua Kafka (xem storage.consumer.ts)
      const presignedPutUrl = await getSignedUrl(
        this.signingClient,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: mimeType,
        }),
        { expiresIn: 3600 },
      );

      await this.kafkaService.produce(KafkaTopic.STORAGE_UPLOAD, [
        {
          value: JSON.stringify({
            mediaId: savedMedia.id,
            fileUrl: presignedPutUrl,
            mimeType: mimeType,
            filename,
            folder: cleanFolder,
          }),
        },
      ]);

      return savedMedia;
    }
  }

  async deleteFile(mediaId: string) {
    const media = await this.mediaRepository.findOne({
      where: { id: mediaId },
    });

    if (!media) {
      return;
    }

    if (media.s3Key) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: media.s3Key,
          }),
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete S3 object for mediaId: ${mediaId}`,
          error,
        );
      }
    }

    try {
      await this.mediaRepository.remove(media);
    } catch (error: unknown) {
      const dbError = error as { code?: string };
      // 23503 = foreign key violation (Postgres): record media vẫn đang được bảng
      // khác tham chiếu nên không xóa được, chấp nhận giữ lại metadata dù file
      // trên S3 đã bị xóa ở trên
      if (dbError.code === '23503') {
        this.logger.warn(
          `Could not delete media record ${mediaId} because it is still referenced by another table. Metadata will remain but file content may have been removed.`,
        );
      } else {
        throw error;
      }
    }
  }

  async processUpload(
    mediaId: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    folder: string,
  ) {
    try {
      const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
      const key = cleanFolder ? `${cleanFolder}/${filename}` : filename;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );

      await this.mediaRepository.update(mediaId, {
        s3Key: key,
        url: '',
        status: MediaStatus.COMPLETED,
      });
    } catch (error) {
      this.logger.error(`Async upload failed for mediaId: ${mediaId}`, error);
      await this.mediaRepository.update(mediaId, {
        status: MediaStatus.FAILED,
      });
    }
  }

  async getPresignedUrl(
    key: string | null | undefined,
    expiresInSeconds = 3600,
  ): Promise<string | null> {
    if (!key) {
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.signingClient, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for key: ${key}`,
        error,
      );
      return null;
    }
  }

  /**
   * Tạo presigned PUT URL để client bên ngoài (thiết bị IoT) upload file thẳng
   * lên S3 mà không cần đi qua backend.
   *
   * Đây là pattern "Out-of-band Upload": MQTT chỉ lo phần tín hiệu nhẹ (signaling),
   * còn payload binary thật sự đi thẳng qua HTTP tới object storage.
   *
   * @param key - S3 object key (đường dẫn) nơi file sẽ được lưu
   * @param mimeType - MIME type của file cần upload (vd: 'image/jpeg')
   * @param expiresInSeconds - Thời gian URL còn hiệu lực (mặc định 1 giờ)
   * @returns URL có thời hạn, kèm credentials AWS để PUT upload
   */
  async getPresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    return await getSignedUrl(this.signingClient, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Upload trực tiếp một buffer thô lên S3 và trả về object key.
   */
  async uploadRawFile(
    buffer: Buffer,
    mimeType: string,
    folder: string,
    filename: string,
  ): Promise<string> {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const key = cleanFolder ? `${cleanFolder}/${filename}` : filename;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return key;
  }

  async getQuota(userId: string, isAdmin: boolean) {
    let logsCount: { media_type: string; count: string }[] = [];
    if (isAdmin) {
      logsCount = await this.mediaRepository.query(`
        SELECT media_type, COUNT(*) as count 
        FROM media_logs 
        WHERE deleted_at IS NULL
        GROUP BY media_type
      `);
    } else {
      logsCount = await this.mediaRepository.query(`
        SELECT ml.media_type, COUNT(*) as count 
        FROM media_logs ml
        INNER JOIN devices d ON d.id = ml.device_id
        WHERE d.owner_id = $1 AND ml.deleted_at IS NULL AND d.deleted_at IS NULL
        GROUP BY ml.media_type
      `, [userId]);
    }

    let estimatedLogsSize = 0;
    for (const row of logsCount) {
      const count = Number(row.count);
      if (row.media_type === 'image_frame') {
        estimatedLogsSize += count * 950 * 1024; // Ước lượng 950 KB mỗi ảnh
      } else if (row.media_type === 'video_chunk') {
        estimatedLogsSize += count * 15 * 1024 * 1024; // Ước lượng 15 MB mỗi clip video
      }
    }

    // Lấy dung lượng file thủ công (nếu có)
    const qb = this.mediaRepository.createQueryBuilder('media');
    if (!isAdmin) {
      qb.where('media.createdBy = :userId', { userId });
    }
    const rawResult = (await qb.select('SUM(media.size)', 'totalSize').getRawOne()) as {
      totalSize: string | number | null;
    };
    const totalSize = rawResult?.totalSize;

    return {
      cloudUsageBytes: Number(totalSize || 0) + estimatedLogsSize,
      cloudTotalBytes: 100 * 1024 * 1024 * 1024, // Hạn mức 100GB
      localBackupBytes: 12.5 * 1024 * 1024 * 1024, // 12.5GB (Mock)
      lastSync: new Date().toISOString(),
    };
  }

  async getFiles(query: StorageFileQueryDto, userId: string, isAdmin: boolean) {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC', type, search } = query;
    const mediaLogRepo = this.mediaRepository.manager.getRepository(MediaLog);
    const qb = mediaLogRepo.createQueryBuilder('mediaLog');

    if (!isAdmin) {
      qb.innerJoin(
        Device,
        'd',
        'd.id = mediaLog.deviceId AND d.ownerId = :userId',
        { userId },
      );
    }

    if (search) {
      qb.andWhere('mediaLog.s3Key ILIKE :search', { search: `%${search}%` });
    }

    if (type) {
      if (type === 'image') {
        qb.andWhere('mediaLog.mediaType = :mediaType', { mediaType: 'image_frame' });
      } else if (type === 'video') {
        qb.andWhere('mediaLog.mediaType = :mediaType', { mediaType: 'video_chunk' });
      }
    }

    const validSortColumns = ['createdAt', 'startTime'];
    const sortCol = validSortColumns.includes(sortBy) ? `mediaLog.${sortBy}` : 'mediaLog.createdAt';

    const [data, total] = await qb
      .orderBy(sortCol, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedData = data.map(item => {
      const fileType = item.mediaType === MediaType.IMAGE_FRAME ? 'image' : 'video';
      const estimatedSize = item.mediaType === MediaType.IMAGE_FRAME ? 950 * 1024 : 15 * 1024 * 1024;
      const basename = path.basename(item.s3Key);

      return {
        id: item.id,
        name: basename,
        type: fileType,
        size: estimatedSize,
        createdAt: item.createdAt,
      };
    });

    return {
      data: formattedData,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    };
  }

  async uploadGenericFile(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    userId: string,
  ) {
    const originalNameWithoutExt = path.parse(file.originalname).name;
    const extension = path.parse(file.originalname).ext;
    const filename = `${Date.now()}-${originalNameWithoutExt}${extension}`;
    const folder = `files/${userId}`;
    const key = `${folder}/${filename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const media = this.mediaRepository.create({
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      status: MediaStatus.COMPLETED,
      s3Key: key,
      url: '',
      createdBy: userId,
    });

    return await this.mediaRepository.save(media);
  }

  /**
   * Lấy metadata (size, contentType) của object trực tiếp từ S3.
   * Dùng để xác nhận file đã upload thành công và kiểm tra giới hạn dung lượng.
   */
  async getObjectMetadata(
    key: string,
  ): Promise<{ size: number; contentType: string } | null> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);
      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || '',
      };
    } catch (error) {
      this.logger.error(`Failed to head S3 object: ${key}`, error);
      return null;
    }
  }

  async getDownloadUrl(id: string, userId: string, isAdmin: boolean) {
    const mediaLogRepo = this.mediaRepository.manager.getRepository(MediaLog);
    const mediaLog = await mediaLogRepo.createQueryBuilder('mediaLog')
      .leftJoinAndSelect('mediaLog.device', 'device')
      .where('mediaLog.id = :id', { id })
      .getOne();

    if (!mediaLog) throw new NotFoundException('File not found');
    if (!isAdmin && mediaLog.device?.ownerId !== userId) throw new ForbiddenException('Access denied');

    const url = await this.getPresignedUrl(mediaLog.s3Key);
    return { url };
  }

  async deleteGenericFile(id: string, userId: string, isAdmin: boolean) {
    const mediaLogRepo = this.mediaRepository.manager.getRepository(MediaLog);
    const mediaLog = await mediaLogRepo.createQueryBuilder('mediaLog')
      .leftJoinAndSelect('mediaLog.device', 'device')
      .where('mediaLog.id = :id', { id })
      .getOne();

    if (!mediaLog) throw new NotFoundException('File not found');
    if (!isAdmin && mediaLog.device?.ownerId !== userId) throw new ForbiddenException('Access denied');

    const deleteS3 = async (key: string | null) => {
      if (!key) return;
      try {
        await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      } catch (err) {
        this.logger.error(`Failed to delete S3 file: ${key}`, err);
      }
    };

    await deleteS3(mediaLog.s3Key);
    await deleteS3(mediaLog.processedS3Key);

    await mediaLogRepo.softRemove(mediaLog);
    return { message: 'File deleted successfully' };
  }
}
