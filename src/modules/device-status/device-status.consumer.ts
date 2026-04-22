import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { DeviceStatusService } from './device-status.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import type { DeviceStatusKafkaPayload } from '@/commons/interfaces/app.interface';
import { DeviceStatusEnum } from '@/commons/enums/app.enum';

/**
 * Kafka consumer that listens to the GNSS_DEVICE_STATUS topic,
 * upserts device heartbeat data, and broadcasts status changes via WebSocket.
 */
@Injectable()
export class DeviceStatusConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(DeviceStatusConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly deviceStatusService: DeviceStatusService,
    private readonly gnssGateway: GnssGateway,
  ) {}

  /**
   * Registers the Kafka consumer on application bootstrap.
   * Subscribes to GNSS_DEVICE_STATUS with a dedicated consumer group.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaService.consume(
      KafkaTopic.GNSS_DEVICE_STATUS,
      KafkaConsumerGroup.GNSS_DEVICE_STATUS,
      this.handleMessage,
    );
    this.logger.log(
      `DeviceStatus Consumer initialized and listening on topic: ${KafkaTopic.GNSS_DEVICE_STATUS}`,
    );
  }

  /**
   * Processes each incoming device status heartbeat:
   * 1. Parses the JSON payload from Kafka
   * 2. Validates the status against DeviceStatusEnum
   * 3. Upserts the device status record via DeviceStatusService
   * 4. Broadcasts the status update via WebSocket
   */
  private handleMessage: EachMessageHandler = async ({
    partition,
    message,
  }) => {
    if (!message.value) return;

    const rawValue = message.value.toString();
    const offset = message.offset;

    try {
      // Step 1: Parse the raw Kafka message body
      const data = JSON.parse(rawValue) as DeviceStatusKafkaPayload;

      // Step 2: Validate status enum value
      const status = data.status as DeviceStatusEnum;
      if (!Object.values(DeviceStatusEnum).includes(status)) {
        this.logger.warn(
          `[P:${partition}][Offset:${offset}] Unknown device status: ${data.status}, skipping`,
        );
        return;
      }

      // Step 3: Upsert the device status
      await this.deviceStatusService.upsert(data.deviceId, {
        status,
        batteryLevel: data.batteryLevel,
        cameraStatus: data.cameraStatus,
        gnssStatus: data.gnssStatus,
      });

      // Step 4: Broadcast status update via WebSocket
      this.gnssGateway.broadcastDeviceStatus(data.deviceId, {
        status,
        batteryLevel: data.batteryLevel,
        cameraStatus: data.cameraStatus,
        gnssStatus: data.gnssStatus,
      });

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Upserted + broadcast status [${status}] for device ${data.deviceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process device status message at offset ${offset}`,
        error instanceof Error ? error.stack : error,
      );
    }
  };
}
