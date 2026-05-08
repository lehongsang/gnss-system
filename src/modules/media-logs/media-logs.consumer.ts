import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { StorageService } from '@/services/storage/storage.service';
import { MediaLogsService } from './media-logs.service';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import { MediaType } from './entities/media-log.entity';

interface MediaUploadMessage {
  deviceId: string;
  mediaType: 'image' | 'video';
  data: string; // Base64 string
  mimeType: string;
  timestamp: string;
}

@Injectable()
export class MediaLogsConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(MediaLogsConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly storageService: StorageService,
    private readonly mediaLogsService: MediaLogsService,
  ) {}

  async onModuleInit() {
    await this.kafkaService.consume(
      KafkaTopic.GNSS_MEDIA_UPLOAD,
      KafkaConsumerGroup.GNSS_MEDIA_UPLOAD,
      this.handleMessage,
    );
    this.logger.log(
      `Media Logs Consumer initialized and listening on topic: ${KafkaTopic.GNSS_MEDIA_UPLOAD}`,
    );
  }

  private handleMessage: EachMessageHandler = async ({
    topic,
    partition,
    message,
  }) => {
    if (!message.value) return;

    const rawValue = message.value.toString();
    const offset = message.offset;

    try {
      const payload = JSON.parse(rawValue) as MediaUploadMessage;
      
      this.logger.log(
        `[P:${partition}][Offset:${offset}] Processing media upload for device: ${payload.deviceId}`,
      );

      // Convert Base64 string back to Buffer
      const buffer = Buffer.from(payload.data, 'base64');
      
      // Determine file extension
      const extension = payload.mediaType === 'image' ? 'jpg' : 'mp4';
      const filename = `${Date.now()}-${payload.deviceId}.${extension}`;
      const folder = `media-logs/${payload.deviceId}`;

      // Upload to S3
      const s3Key = await this.storageService.uploadRawFile(
        buffer,
        payload.mimeType,
        folder,
        filename,
      );

      // Map mediaType
      const mappedMediaType =
        payload.mediaType === 'image'
          ? MediaType.IMAGE_FRAME
          : MediaType.VIDEO_CHUNK;

      // Save to database
      await this.mediaLogsService.create({
        deviceId: payload.deviceId,
        mediaType: mappedMediaType,
        startTime: new Date(payload.timestamp),
        endTime: new Date(payload.timestamp), // For image frames, end = start. For video, could be different but we use the timestamp as is.
        s3Key: s3Key,
        fileUrl: '', // Using presigned URLs now, so fileUrl can be empty
      });

    } catch (error) {
      this.logger.error(
        `Failed to process media upload message at offset ${offset} on topic ${topic}`,
        error instanceof Error ? error.stack : error,
      );
    }
  };
}
