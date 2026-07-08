import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { AlertsService } from './alerts.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { MailService } from '@/services/mail/mail.service';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import type { AlertKafkaPayload, GnssKafkaEnvelope } from '@/commons/interfaces/app.interface';
import { AlertType } from '@/commons/enums/app.enum';
import { TelemetryService } from '@/modules/telemetry/telemetry.service';

/**
 * Tiêu đề cảnh báo dùng để hiển thị trong notification và email.
 * Map mỗi giá trị enum AlertType sang tiêu đề tiếng Việt dễ đọc.
 */
const ALERT_TITLES: Record<AlertType, string> = {
  [AlertType.GEOFENCE_EXIT]: 'Thiết bị thoát khỏi vùng địa lý',
  [AlertType.SPEEDING]: 'Vượt tốc độ giới hạn',
  [AlertType.SIGNAL_LOST]: 'Mất tín hiệu GPS',
  [AlertType.DANGEROUS_OBSTACLE]: 'Phát hiện chướng ngại vật',
  [AlertType.TRAJECTORY_DEVIATION]: 'Lệch khỏi quỹ đạo',
  [AlertType.GEOFENCE_ENTRY]: 'Restricted zone entry',
  [AlertType.SUDDEN_MOTION]: 'Phát hiện chuyển động đột ngột (AI)',
  [AlertType.ABNORMAL_STOP]: 'Dừng xe bất thường (AI)',
};

/**
 * Các loại cảnh báo nghiêm trọng cần gửi email thông báo.
 * Chỉ những loại này mới trigger email cho chủ thiết bị;
 * các cảnh báo không nghiêm trọng vẫn sẽ được broadcast qua WebSocket.
 */
const CRITICAL_ALERT_TYPES: AlertType[] = [
  AlertType.GEOFENCE_EXIT,
  AlertType.GEOFENCE_ENTRY,
  AlertType.SIGNAL_LOST,
  AlertType.DANGEROUS_OBSTACLE,
  AlertType.SUDDEN_MOTION,
];

/**
 * Kafka consumer lắng nghe topic GNSS_ALERTS, lưu các cảnh báo từ thiết bị,
 * broadcast qua WebSocket, và gửi email thông báo cho các loại cảnh báo nghiêm trọng.
 */
@Injectable()
export class AlertsConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(AlertsConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly alertsService: AlertsService,
    private readonly gnssGateway: GnssGateway,
    private readonly devicesService: DevicesService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
  ) {}

  /**
   * Đăng ký Kafka consumer khi ứng dụng khởi động.
   * Subscribe topic GNSS_ALERTS với consumer group riêng.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaService.consume(
      KafkaTopic.GNSS_ALERTS,
      KafkaConsumerGroup.GNSS_ALERTS,
      this.handleMessage,
    );
    this.logger.log(
      `Alerts Consumer initialized and listening on topic: ${KafkaTopic.GNSS_ALERTS}`,
    );
  }

  /**
   * Xử lý từng message cảnh báo nhận được:
   * 1. Parse JSON payload từ Kafka
   * 2. Validate alert type theo enum AlertType
   * 3. Tạo bản ghi alert mới qua AlertsService
   * 4. Tìm chủ sở hữu thiết bị, broadcast qua WebSocket
   * 5. Gửi email thông báo cho các loại cảnh báo nghiêm trọng
   */
  private handleMessage: EachMessageHandler = async ({
    partition,
    message,
  }) => {
    if (!message.value) return;

    const rawValue = message.value.toString();
    const offset = message.offset;

    try {
      // Bước 1: Parse body message từ envelope Kafka
      const rawObject = JSON.parse(rawValue) as GnssKafkaEnvelope<AlertKafkaPayload>;
      if (!rawObject || !rawObject.payload) {
        throw new Error('Invalid GnssKafkaEnvelope structure: missing payload');
      }
      const data = rawObject.payload;

      // Bước 2: Validate alert type theo enum, type lạ thì bỏ qua luôn
      const alertType = data.type as AlertType;
      if (!Object.values(AlertType).includes(alertType)) {
        this.logger.warn(
          `[P:${partition}][Offset:${offset}] Unknown alert type: ${data.type}, skipping`,
        );
        return;
      }

      // Bước 2.5: Nếu thiết bị gửi lat/lng = 0 (chưa có GPS fix) thì lấy tọa độ telemetry gần nhất thay thế
      let latitude = data.location.lat;
      let longitude = data.location.lng;
      if (latitude === 0 && longitude === 0) {
        const latestTelemetry = await this.telemetryService.findLatestByDevice(data.deviceId);
        if (latestTelemetry) {
          latitude = latestTelemetry.lat;
          longitude = latestTelemetry.lng;
        }
      }

      // Bước 3: Tạo bản ghi alert
      const snapshotMediaLog = data.snapshotId
        ? await this.alertsService.findSnapshotMediaLog(
            data.deviceId,
            data.snapshotId,
          )
        : null;
      const savedAlert = await this.alertsService.create({
        deviceId: data.deviceId,
        alertType,
        message: data.message,
        lat: latitude,
        lng: longitude,
        snapshotId: data.snapshotId,
        snapshotMediaLogId: snapshotMediaLog?.id,
      });

      // Bước 4 & 5: Tìm chủ thiết bị → broadcast WebSocket + gửi email thông báo
      try {
        const device = await this.devicesService.findOne(
          data.deviceId,
          '',
          true, // Dùng admin mode để bỏ qua kiểm tra quyền sở hữu
        );

        if (device.ownerId && device.owner) {
          // Bước 4a: Broadcast WebSocket tới room của user
          this.gnssGateway.broadcastAlert(device.ownerId, {
            id: savedAlert.id,
            deviceId: data.deviceId,
            alertType: savedAlert.alertType,
            message: savedAlert.message,
            lat: savedAlert.lat,
            lng: savedAlert.lng,
            snapshotId: savedAlert.snapshotId,
            snapshotMediaLogId: savedAlert.snapshotMediaLogId,
          });

          // Bước 5: Gửi email thông báo cho cảnh báo nghiêm trọng
          // Chỉ gửi email nếu thiết bị báo cáo mức độ thực sự nguy hiểm (HIGH hoặc CRITICAL)
          const isHighSeverity = data.severity === 'CRITICAL' || data.severity === 'HIGH';

          if (CRITICAL_ALERT_TYPES.includes(alertType) && isHighSeverity) {
            const title = ALERT_TITLES[alertType] ?? 'Cảnh báo từ thiết bị';
            const body = `Thiết bị "${device.name}": ${savedAlert.message}`;

            // Fire-and-forget — gửi email lỗi cũng không được chặn luồng xử lý chính
            this.mailService
              .sendAlertEmail(device.owner.email, title, body)
              .catch((err: unknown) => {
                this.logger.warn(
                  `Email notification failed for alert ${savedAlert.id}: ${err instanceof Error ? err.message : String(err)}`,
                );
              });
          }
        }
      } catch {
        // Lỗi tìm thiết bị không được làm ảnh hưởng tới việc lưu alert đã tạo
        this.logger.warn(
          `Could not broadcast/notify alert — device ${data.deviceId} lookup failed`,
        );
      }

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Created + broadcast alert [${alertType}] for device ${data.deviceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process alert message at offset ${offset}`,
        error instanceof Error ? error.stack : error,
      );

      // Đẩy message lỗi sang Dead Letter Queue (DLQ) để xử lý sau
      try {
        const dlqPayload = {
          originalPayload: rawValue,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          topic: KafkaTopic.GNSS_ALERTS,
          partition,
          offset,
          failedAt: new Date().toISOString(),
        };

        await this.kafkaService.produce(KafkaTopic.GNSS_ALERTS_DLQ, [
          {
            key: message.key?.toString(),
            value: JSON.stringify(dlqPayload),
          },
        ]);
      } catch (dlqError) {
        this.logger.error(
          `Failed to publish alert failure to DLQ: ${dlqError instanceof Error ? dlqError.message : String(dlqError)}`,
        );
      }
    }
  };
}
