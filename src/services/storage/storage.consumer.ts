import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { StorageService } from './storage.service';
import { EachMessageHandler } from 'kafkajs';
import {
  KafkaConsumerGroup,
  KafkaTopic,
} from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import type { StorageUploadMessage } from './storage.interface';


@Injectable()
export class StorageConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(StorageConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly storageService: StorageService,
  ) {}

  async onModuleInit() {
    // Đăng ký consumer, dùng cơ chế auto commit offset mặc định của KafkaJS
    await this.kafkaService.consume(
      KafkaTopic.STORAGE_UPLOAD,
      KafkaConsumerGroup.STORAGE_UPLOAD,
      this.handleMessage,
    );
    this.logger.log(
      `Storage Consumer initialized and listening on topic: ${KafkaTopic.STORAGE_UPLOAD}`,
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
      const payload = JSON.parse(rawValue) as StorageUploadMessage;
      const { mediaId, fileUrl, mimeType, filename, folder } = payload;

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Processing storage upload for mediaId: ${mediaId}`,
      );

      // Tải nội dung file về từ presigned URL mà client đã upload lên trước đó
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch file from presigned URL: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();

      // Xử lý upload thật sự lên S3
      await this.storageService.processUpload(
        mediaId,
        Buffer.from(arrayBuffer),
        mimeType,
        filename,
        folder,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process storage upload message at offset ${offset} on topic ${topic}`,
        error instanceof Error ? error.stack : error,
      );
    }
  };
}
