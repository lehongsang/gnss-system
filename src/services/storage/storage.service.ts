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

    this.s3Client = new S3Client({
      ...commonConfig,
      endpoint: (endpoint as string) || undefined,
    });

    this.signingClient = new S3Client({
      ...commonConfig,
      endpoint: (externalUrl as string) || undefined,
    });
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
      const presignedPutUrl = await getSignedUrl(
        this.s3Client,
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
   * Generates a presigned PUT URL that allows an external client (IoT device)
   * to upload a file directly to S3 without going through the backend.
   *
   * This is the "Out-of-band Upload" pattern: MQTT handles lightweight signaling,
   * while the actual binary payload travels over HTTP directly to object storage.
   *
   * @param key - The S3 object key (path) where the file will be stored
   * @param mimeType - MIME type of the file to be uploaded (e.g. 'image/jpeg')
   * @param expiresInSeconds - How long the URL remains valid (default 1 hour)
   * @returns A time-limited URL with embedded AWS credentials for PUT upload
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

    return await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Uploads a raw buffer directly to S3 and returns the object key.
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
    const qb = this.mediaRepository.createQueryBuilder('media');
    if (!isAdmin) {
      qb.where('media.createdBy = :userId', { userId });
    }
    const rawResult = (await qb.select('SUM(media.size)', 'totalSize').getRawOne()) as {
      totalSize: string | number | null;
    };
    const totalSize = rawResult?.totalSize;

    return {
      cloudUsageBytes: Number(totalSize || 0),
      cloudTotalBytes: 100 * 1024 * 1024 * 1024, // 100GB
      localBackupBytes: 12.5 * 1024 * 1024 * 1024, // 12.5GB (Mock)
      lastSync: new Date().toISOString(),
    };
  }

  async getFiles(query: StorageFileQueryDto, userId: string, isAdmin: boolean) {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC', type, search } = query;
    const qb = this.mediaRepository.createQueryBuilder('media');

    if (!isAdmin) {
      qb.andWhere('media.createdBy = :userId', { userId });
    }

    if (search) {
      qb.andWhere('media.originalName ILIKE :search', { search: `%${search}%` });
    }

    if (type) {
      if (type === 'image') qb.andWhere('media.mimeType LIKE :mime', { mime: 'image/%' });
      else if (type === 'video') qb.andWhere('media.mimeType LIKE :mime', { mime: 'video/%' });
      else if (type === 'document') qb.andWhere("media.mimeType IN ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')");
      else if (type === 'archive') qb.andWhere("media.mimeType IN ('application/zip', 'application/x-rar-compressed', 'application/gzip')");
    }

    const [data, total] = await qb
      .orderBy(`media.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedData = data.map(item => {
      let fileType = 'other';
      if (item.mimeType.startsWith('image/')) fileType = 'image';
      else if (item.mimeType.startsWith('video/')) fileType = 'video';
      else if (item.mimeType.includes('pdf') || item.mimeType.includes('word')) fileType = 'document';
      else if (item.mimeType.includes('zip') || item.mimeType.includes('rar') || item.mimeType.includes('gzip')) fileType = 'archive';

      return {
        id: item.id,
        name: item.originalName,
        type: fileType,
        size: Number(item.size),
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

  async getDownloadUrl(id: string, userId: string, isAdmin: boolean) {
    const media = await this.mediaRepository.findOne({ where: { id } });
    if (!media) throw new NotFoundException('File not found');
    if (!isAdmin && media.createdBy !== userId) throw new ForbiddenException('Access denied');

    const url = await this.getPresignedUrl(media.s3Key);
    return { url };
  }

  async deleteGenericFile(id: string, userId: string, isAdmin: boolean) {
    const media = await this.mediaRepository.findOne({ where: { id } });
    if (!media) throw new NotFoundException('File not found');
    if (!isAdmin && media.createdBy !== userId) throw new ForbiddenException('Access denied');

    await this.deleteFile(id);
    return { message: 'File deleted successfully' };
  }
}
