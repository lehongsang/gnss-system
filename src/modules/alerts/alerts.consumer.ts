import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { AlertsService } from './alerts.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { MailService } from '@/services/mail/mail.service';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import type { AlertKafkaPayload } from '@/commons/interfaces/app.interface';
import { AlertType } from '@/commons/enums/app.enum';

/**
 * Alert type titles for display in notifications and emails.
 * Maps each AlertType enum value to a human-readable Vietnamese title.
 */
const ALERT_TITLES: Record<AlertType, string> = {
  [AlertType.GEOFENCE_EXIT]: '⚠️ Thiết bị thoát khỏi vùng địa lý',
  [AlertType.SPEEDING]: '🚨 Vượt tốc độ giới hạn',
  [AlertType.SIGNAL_LOST]: '📡 Mất tín hiệu GPS',
  [AlertType.DANGEROUS_OBSTACLE]: '🚧 Phát hiện chướng ngại vật',
  [AlertType.TRAJECTORY_DEVIATION]: '🛤️ Lệch khỏi quỹ đạo',
};

/**
 * Critical alert types that warrant an email notification.
 * Only these types will trigger an email to the device owner;
 * non-critical alerts will still be broadcast via WebSocket.
 */
const CRITICAL_ALERT_TYPES: AlertType[] = [
  AlertType.GEOFENCE_EXIT,
  AlertType.SIGNAL_LOST,
  AlertType.DANGEROUS_OBSTACLE,
];

/**
 * Kafka consumer that listens to the GNSS_ALERTS topic,
 * persists incoming device alerts, broadcasts them via WebSocket,
 * and sends email notifications for critical alert types.
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
  ) {}

  /**
   * Registers the Kafka consumer on application bootstrap.
   * Subscribes to GNSS_ALERTS with a dedicated consumer group.
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
   * Processes each incoming alert message:
   * 1. Parses the JSON payload from Kafka
   * 2. Validates the alert type against the AlertType enum
   * 3. Creates a new alert record via AlertsService
   * 4. Looks up the device owner, broadcasts via WebSocket
   * 5. Sends email notification for critical alert types
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
      const data = JSON.parse(rawValue) as AlertKafkaPayload;

      // Step 2: Validate alert type against enum
      const alertType = data.type as AlertType;
      if (!Object.values(AlertType).includes(alertType)) {
        this.logger.warn(
          `[P:${partition}][Offset:${offset}] Unknown alert type: ${data.type}, skipping`,
        );
        return;
      }

      // Step 3: Create the alert record
      const savedAlert = await this.alertsService.create({
        deviceId: data.deviceId,
        alertType,
        message: data.message,
        lat: data.location.lat,
        lng: data.location.lng,
      });

      // Step 4 & 5: Look up device owner → WebSocket broadcast + email notification
      try {
        const device = await this.devicesService.findOne(
          data.deviceId,
          '',
          true, // Use admin mode to bypass ownership check
        );

        if (device.ownerId && device.owner) {
          // Step 4a: WebSocket broadcast to user room
          this.gnssGateway.broadcastAlert(device.ownerId, {
            id: savedAlert.id,
            deviceId: data.deviceId,
            alertType: savedAlert.alertType,
            message: savedAlert.message,
            lat: savedAlert.lat,
            lng: savedAlert.lng,
          });

          // Step 5: Send email notification for critical alerts
          if (CRITICAL_ALERT_TYPES.includes(alertType)) {
            const title = ALERT_TITLES[alertType] ?? 'Cảnh báo từ thiết bị';
            const body = `Thiết bị "${device.name}": ${savedAlert.message}`;

            // Fire-and-forget — email failure should not block processing
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
        // Device lookup failure should not block alert persistence
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
    }
  };
}
