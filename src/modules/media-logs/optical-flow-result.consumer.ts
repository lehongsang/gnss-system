import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaService } from '@/services/kafka/kafka.service';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import { MediaLog } from './entities/media-log.entity';
import { MqttService } from '@/services/mqtt/mqtt.service';

interface OpticalFlowResultMessage {
  jobId: string;
  status: 'completed' | 'failed' | 'cancelled';
  outputS3Key?: string;
  error?: string;
}

@Injectable()
export class OpticalFlowResultConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(OpticalFlowResultConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly mqttService: MqttService,
    @InjectRepository(MediaLog)
    private readonly mediaLogRepository: Repository<MediaLog>,
  ) {}

  async onModuleInit() {
    await this.kafkaService.consume(
      KafkaTopic.GNSS_MEDIA_PROCESS_RESULT,
      KafkaConsumerGroup.GNSS_MEDIA_PROCESS_RESULT,
      this.handleMessage,
    );
    this.logger.log(
      `Optical Flow Result Consumer initialized and listening on topic: ${KafkaTopic.GNSS_MEDIA_PROCESS_RESULT}`,
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
      const payload = JSON.parse(rawValue) as OpticalFlowResultMessage;
      if (!payload || !payload.jobId) {
        throw new Error('Invalid message payload structure: missing jobId');
      }

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Processing AI result for media log: ${payload.jobId} Status: ${payload.status}`,
      );

      const log = await this.mediaLogRepository.findOne({
        where: { id: payload.jobId },
      });

      if (!log) {
        throw new Error(`Media log not found for ID: ${payload.jobId}`);
      }

      log.processingStatus = payload.status;
      if (payload.status === 'completed' && payload.outputS3Key) {
        log.processedS3Key = payload.outputS3Key;
        log.processingError = null;
      } else {
        log.processingError = payload.error || 'Unknown AI processing error';
      }

      await this.mediaLogRepository.save(log);
      this.logger.log(`Successfully updated AI processing status for MediaLog ${payload.jobId} to ${payload.status}`);

      // Push notification via MQTT
      const mqttTopic = `gnss/${log.deviceId}/media/result`;
      try {
        await this.mqttService.publishJson(mqttTopic, {
          jobId: payload.jobId,
          status: payload.status,
          outputS3Key: payload.outputS3Key,
          error: payload.error
        });
        this.logger.log(`Published processing result to MQTT topic ${mqttTopic}`);
      } catch (mqttErr) {
        this.logger.error(`Failed to publish MQTT notification to ${mqttTopic}: ${mqttErr}`);
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process optical flow result message at offset ${offset} on topic ${topic}: ${errMsg}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  };
}