import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '@/services/kafka/kafka.service';
import { TelemetryService } from './telemetry.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { AlertsService } from '@/modules/alerts/alerts.service';
import { GeofencesService } from '@/modules/geofences/geofences.service';
import { RouteDeviationService } from '@/modules/route-plans/route-deviation.service';
import { RedisService } from '@/services/redis/redis.service';
import { EachBatchHandler } from 'kafkajs';
import { KafkaConsumerGroup, KafkaTopic } from '@/services/kafka/kafka.enum';
import { LoggerService } from '@/commons/logger/logger.service';
import { AlertType } from '@/commons/enums/app.enum';
import type { CoordinatePayload, GnssKafkaEnvelope } from '@/commons/interfaces/app.interface';
import type { AccuracyStatus } from '@/commons/enums/app.enum';
import { PayloadValidator } from '@/utils/payload-validator.util';
import { TelemetryPayloadDto } from './dtos/telemetry-payload.dto';

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
    private readonly geofencesService: GeofencesService,
    private readonly routeDeviationService: RouteDeviationService,
  ) {}

  /**
   * Registers the Kafka batch consumer on application bootstrap.
   */
  async onModuleInit(): Promise<void> {
    await this.kafkaService.consumeBatch(
      KafkaTopic.GNSS_COORDINATES,
      KafkaConsumerGroup.GNSS_COORDINATES,
      this.handleBatch,
    );
    this.logger.log(
      `Telemetry Consumer initialized in BATCH mode on topic: ${KafkaTopic.GNSS_COORDINATES}`,
    );
  }

  /**
   * Processes a batch of incoming coordinate messages:
   * 1. Parses and validates all items in the batch.
   * 2. Persists all valid points to TimescaleDB in a single multi-row INSERT.
   * 3. Broadcasts updates via WebSocket and triggers async violations checks.
   */
  private handleBatch: EachBatchHandler = async ({ batch }) => {
    const validPoints: { deviceId: string; payload: CoordinatePayload }[] = [];
    const partition = batch.partition;

    for (const message of batch.messages) {
      if (!message.value) continue;

      try {
        const rawValue = message.value.toString();
        const rawObject = JSON.parse(rawValue) as GnssKafkaEnvelope<unknown>;
        const data = await PayloadValidator.validate(
          TelemetryPayloadDto,
          rawObject.payload,
        );

        const payload: CoordinatePayload = {
          lng: data.lng,
          lat: data.lat,
          speed: data.speed,
          heading: data.heading,
          timestamp: new Date(data.timestamp),
          accuracyStatus: 'gnss_only' as AccuracyStatus,
        };

        validPoints.push({ deviceId: data.deviceId, payload });

        // Immediate Broadcast (Real-time feeling)
        this.gnssGateway.broadcastTelemetry(data.deviceId, {
          ...payload,
        });
      } catch (err) {
        this.logger.error(`Failed to parse batch message`, err);
      }
    }

    if (validPoints.length === 0) return;

    try {
      // Step 2: Bulk Persist to TimescaleDB
      await this.telemetryService.saveBatch(validPoints);

      // Step 3: Run violation checks for each valid point
      // Optimization: we run these in parallel but they don't block the next batch fetch
      for (const { deviceId, payload } of validPoints) {
        this.runAsyncChecks(deviceId, payload).catch((e) =>
          this.logger.error(`Async checks failed for ${deviceId}`, e),
        );
      }

      this.logger.log(
        `[P:${partition}] Persisted batch of ${validPoints.length} telemetry points`,
      );
    } catch (error) {
      this.logger.error(`Failed to persist telemetry batch`, error);
    }
  };

  /**
   * Offloads analysis logic to prevent blocking the main ingestion flow.
   */
  private async runAsyncChecks(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    await Promise.all([
      this.checkSpeedViolation(deviceId, payload),
      this.checkGeofenceViolation(deviceId, payload),
      this.checkRouteDeviation(deviceId, payload),
    ]);
  }


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
      // Optimization: Cache device speed limit in Redis for 5 minutes
      const cacheKey = `device:limit:${deviceId}`;
      let speedLimitKmh: number | null = null;

      const cachedLimit = await this.redisService.get(cacheKey);
      if (cachedLimit !== null) {
        speedLimitKmh = parseFloat(cachedLimit);
      } else {
        const device = await this.devicesService.findOne(deviceId, '', true);
        speedLimitKmh = device.speedLimitKmh || 0;
        await this.redisService.setex(cacheKey, 300, speedLimitKmh.toString());
      }

      if (!speedLimitKmh || payload.speed <= speedLimitKmh) return;

      // Check Redis cooldown to prevent alert spam
      const cooldownKey = `speeding:${deviceId}`;
      const alreadyAlerted = await this.redisService.get(cooldownKey);
      if (alreadyAlerted) return;

      // Create the SPEEDING alert
      await this.alertsService.create({
        deviceId,
        alertType: AlertType.SPEEDING,
        message: `Vận tốc ${payload.speed.toFixed(1)} km/h vượt ngưỡng ${speedLimitKmh} km/h`,
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
        `SPEEDING detected for device ${deviceId}: ${payload.speed.toFixed(1)} km/h > ${speedLimitKmh} km/h`,
      );

    } catch (error) {
      // Speed check failure should not block telemetry processing
      this.logger.warn(
        `Speed check failed for device ${deviceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Checks if the device has exited any of its assigned geofences.
   * Leverages PostGIS server-side spatial querying via GeofencesService.
   *
   * @param deviceId - UUID of the device
   * @param payload - The coordinate payload
   */
  private async checkGeofenceViolation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    try {
      // Evaluate assigned geofence rules and return only newly triggered violations.
      const violations = await this.geofencesService.evaluateGeofenceTransitions(
        deviceId,
        payload.lat,
        payload.lng,
      );

      if (!violations || violations.length === 0) return;

      // For each violated geofence, check cooldown and trigger alert
      for (const violation of violations) {
        const { geofence, alertType } = violation;
        const cooldownKey = `${alertType}:${deviceId}:${geofence.id}`;
        const alreadyAlerted = await this.redisService.get(cooldownKey);

        if (alreadyAlerted) continue; // Alert was already sent recently

        const message =
          alertType === AlertType.GEOFENCE_EXIT
            ? `Device exited allowed zone: ${geofence.name}`
            : `Device entered forbidden zone: ${geofence.name}`;

        await this.alertsService.create({
          deviceId,
          alertType,
          message,
          lat: payload.lat,
          lng: payload.lng,
        });

        // Set cooldown (e.g., 5 minutes = 300s) to prevent spamming emails
        const GEOFENCE_COOLDOWN_SECONDS = 300;
        await this.redisService.setex(
          cooldownKey,
          GEOFENCE_COOLDOWN_SECONDS,
          '1',
        );

        this.logger.warn(
          `${alertType} detected for device ${deviceId} on geofence ${geofence.name}`,
        );
      }
    } catch (error) {
      // Geofence check failure should not block telemetry processing
      this.logger.warn(
        `Geofence check failed for device ${deviceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Checks whether the device has deviated from its active planned route.
   */
  private async checkRouteDeviation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    await this.routeDeviationService.checkDeviation(deviceId, payload);
  }
}
