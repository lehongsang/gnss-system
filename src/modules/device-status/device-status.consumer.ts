import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { DeviceStatusService } from './device-status.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import { PayloadValidator } from '@/utils/payload-validator.util';
import { DeviceStatusPayloadDto } from './dtos/device-status-payload.dto';
import { GnssKafkaEnvelope } from '@/commons/interfaces/app.interface';

/**
 * Kafka consumer lắng nghe topic GNSS_DEVICE_STATUS, upsert dữ liệu heartbeat
 * của thiết bị và broadcast thay đổi trạng thái qua WebSocket.
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
   * Đăng ký Kafka consumer khi ứng dụng khởi động.
   * Subscribe topic GNSS_DEVICE_STATUS với consumer group riêng.
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
   * Xử lý từng heartbeat trạng thái thiết bị nhận được:
   * 1. Parse JSON payload từ Kafka
   * 2. Validate status theo DeviceStatusEnum
   * 3. Upsert bản ghi trạng thái thiết bị qua DeviceStatusService
   * 4. Broadcast cập nhật trạng thái qua WebSocket
   */
  private handleMessage: EachMessageHandler = async ({
    partition,
    message,
  }) => {
    if (!message.value) return;

    const rawValue = message.value.toString();
    const offset = message.offset;

    try {
      // Bước 1: Parse envelope và lấy payload
      const rawObject = JSON.parse(rawValue) as GnssKafkaEnvelope<unknown>;
      if (!rawObject || !rawObject.payload) {
        throw new Error('Invalid GnssKafkaEnvelope structure: missing payload');
      }
      const data = await PayloadValidator.validate(DeviceStatusPayloadDto, rawObject.payload);

      // Bước 2: Lấy status
      const status = data.status;

      // Bước 3: Upsert trạng thái thiết bị
      await this.deviceStatusService.upsert(data.deviceId, {
        status,
        batteryLevel: data.batteryLevel,
        cameraStatus: data.cameraStatus,
        gnssStatus: data.gnssStatus,
        satellitesTracked: data.satellitesTracked,
        signalStrength: data.signalStrength,
      });

      // Bước 4: Broadcast cập nhật trạng thái qua WebSocket
      this.gnssGateway.broadcastDeviceStatus(data.deviceId, {
        status,
        batteryLevel: data.batteryLevel,
        cameraStatus: data.cameraStatus,
        gnssStatus: data.gnssStatus,
        satellitesTracked: data.satellitesTracked ?? 0,
        signalStrength: data.signalStrength ?? 0,
      });

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Upserted + broadcast status [${status}] for device ${data.deviceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process device status message at offset ${offset}`,
        error instanceof Error ? error.stack : error,
      );

      // Đẩy message lỗi sang Dead Letter Queue (DLQ) để xử lý sau
      try {
        const dlqPayload = {
          originalPayload: rawValue,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          topic: KafkaTopic.GNSS_DEVICE_STATUS,
          partition,
          offset,
          failedAt: new Date().toISOString(),
        };

        await this.kafkaService.produce(KafkaTopic.GNSS_DEVICE_STATUS_DLQ, [
          {
            key: message.key?.toString(),
            value: JSON.stringify(dlqPayload),
          },
        ]);
      } catch (dlqError) {
        this.logger.error(
          `Failed to publish device status failure to DLQ: ${dlqError instanceof Error ? dlqError.message : String(dlqError)}`,
        );
      }
    }
  };
}
