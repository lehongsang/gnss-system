import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { TelemetryService } from './telemetry.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { AlertsService } from '@/modules/alerts/alerts.service';
import { RedisService } from '@/services/redis/redis.service';
import { EachMessageHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import { AlertType } from '@/commons/enums/app.enum';
import type { CoordinatePayload } from '@/commons/interfaces/app.interface';
import type { AccuracyStatus } from '@/commons/enums/app.enum';

/**
 * Cooldown period (in seconds) between SPEEDING alerts for the same device.
 * Prevents spam when a device continuously exceeds the speed limit.
 */
const SPEEDING_COOLDOWN_SECONDS = 60;

/**
 * Kafka consumer that listens to the GNSS_COORDINATES topic,
 * persists incoming GPS data points, broadcasts them via WebSocket,
 * and performs server-side speed violation detection.
 */
@Injectable()
export class TelemetryConsumer implements OnModuleInit {
  private readonly logger = new LoggerService(TelemetryConsumer.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly telemetryService: TelemetryService,
    private readonly gnssGateway: GnssGateway,
    private readonly devicesService: DevicesService,
    private readonly alertsService: AlertsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Registers the Kafka consumer on application bootstrap.
   * Subscribes to GNSS_COORDINATES with a dedicated consumer group.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaService.consume(
      KafkaTopic.GNSS_COORDINATES,
      KafkaConsumerGroup.GNSS_COORDINATES,
      this.handleMessage,
    );
    this.logger.log(
      `Telemetry Consumer initialized and listening on topic: ${KafkaTopic.GNSS_COORDINATES}`,
    );
  }

  /**
   * Processes each incoming coordinate message:
   * 1. Parses the JSON payload from Kafka
   * 2. Builds the CoordinatePayload and persists via TelemetryService
   * 3. Broadcasts the telemetry update via WebSocket to subscribed clients
   * 4. Checks speed against device limit and creates SPEEDING alert if exceeded
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
      const data = JSON.parse(rawValue) as {
        deviceId: string;
        lng: number;
        lat: number;
        speed: number;
        heading: number;
        altitude: number;
        timestamp: string;
      };

      // Step 2: Build the CoordinatePayload expected by the service
      const payload: CoordinatePayload = {
        lng: data.lng,
        lat: data.lat,
        speed: data.speed,
        heading: data.heading,
        altitude: data.altitude,
        timestamp: new Date(data.timestamp),
        accuracyStatus: 'gnss_only' as AccuracyStatus,
      };

      // Step 3: Persist the telemetry point
      await this.telemetryService.savePoint(data.deviceId, payload);

      // Step 4: Broadcast via WebSocket to clients watching this device
      this.gnssGateway.broadcastTelemetry(data.deviceId, {
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed,
        heading: payload.heading,
        altitude: payload.altitude,
        timestamp: payload.timestamp,
      });

      // Step 5: Server-side speed detection
      await this.checkSpeedViolation(data.deviceId, payload);

      this.logger.log(
        `[P:${partition}][Offset:${offset}] Saved + broadcast telemetry for device ${data.deviceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process telemetry message at offset ${offset}`,
        error instanceof Error ? error.stack : error,
      );
    }
  };

  /**
   * Checks if the device's speed exceeds its configured speed limit.
   * If the limit is exceeded and no cooldown is active, creates a SPEEDING alert
   * and sets a Redis TTL key to prevent alert spam (max 1 alert per cooldown period).
   *
   * @param deviceId - UUID of the device
   * @param payload - The coordinate payload containing the current speed
   */
  private async checkSpeedViolation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    // Skip if speed is zero or negative (device is stationary or data invalid)
    if (payload.speed <= 0) return;

    try {
      // Look up the device to get its speed limit configuration
      const device = await this.devicesService.findOne(deviceId, '', true);

      // Skip if no speed limit is configured for this device
      if (!device.speedLimitKmh) return;

      // Skip if speed is within the limit
      if (payload.speed <= device.speedLimitKmh) return;

      // Check Redis cooldown to prevent alert spam
      const cooldownKey = `speeding:${deviceId}`;
      const alreadyAlerted = await this.redisService.get(cooldownKey);
      if (alreadyAlerted) return;

      // Create the SPEEDING alert
      await this.alertsService.create({
        deviceId,
        alertType: AlertType.SPEEDING,
        message: `Vận tốc ${payload.speed.toFixed(1)} km/h vượt ngưỡng ${device.speedLimitKmh} km/h`,
        lat: payload.lat,
        lng: payload.lng,
      });

      // Set cooldown to prevent sending another alert within the cooldown period
      await this.redisService.setex(
        cooldownKey,
        SPEEDING_COOLDOWN_SECONDS,
        '1',
      );

      this.logger.warn(
        `SPEEDING detected for device ${deviceId}: ${payload.speed.toFixed(1)} km/h > ${device.speedLimitKmh} km/h`,
      );
    } catch (error) {
      // Speed check failure should not block telemetry processing
      this.logger.warn(
        `Speed check failed for device ${deviceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
