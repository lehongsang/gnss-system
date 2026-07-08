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
 * Thời gian cooldown (giây) giữa 2 lần cảnh báo SPEEDING cho cùng 1 thiết bị.
 * Tránh spam cảnh báo khi thiết bị chạy quá tốc độ liên tục.
 */
const SPEEDING_COOLDOWN_SECONDS = 60;

/**
 * Kafka consumer lắng nghe topic GNSS_COORDINATES, lưu các điểm GPS nhận được,
 * broadcast qua WebSocket, và kiểm tra vi phạm tốc độ ngay tại server.
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
   * Đăng ký Kafka batch consumer khi app khởi động.
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
   * Xử lý 1 batch message tọa độ:
   * 1. Parse và validate từng item trong batch.
   * 2. Lưu toàn bộ điểm hợp lệ vào TimescaleDB bằng 1 câu INSERT nhiều dòng.
   * 3. Broadcast qua WebSocket và chạy các check vi phạm ở chế độ bất đồng bộ.
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

        // Broadcast ngay lập tức để có cảm giác real-time, không chờ lưu DB xong
        this.gnssGateway.broadcastTelemetry(data.deviceId, {
          ...payload,
        });
      } catch (err) {
        this.logger.error(`Failed to parse batch message`, err);
      }
    }

    if (validPoints.length === 0) return;

    try {
      // Bước 2: lưu hàng loạt vào TimescaleDB
      await this.telemetryService.saveBatch(validPoints);

      // Bước 3: chạy check vi phạm cho từng điểm hợp lệ
      // Tối ưu: chạy song song và không await -> không chặn việc lấy batch tiếp theo
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
   * Tách riêng logic phân tích ra khỏi luồng chính để không làm chậm việc nhận dữ liệu.
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
   * Kiểm tra tốc độ thiết bị có vượt giới hạn cấu hình không.
   * Nếu vượt và không đang trong cooldown thì tạo alert SPEEDING và set TTL Redis
   * để tránh spam (tối đa 1 alert mỗi chu kỳ cooldown).
   *
   * @param deviceId - UUID của thiết bị
   * @param payload - Payload tọa độ chứa tốc độ hiện tại
   */
  private async checkSpeedViolation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    // Bỏ qua nếu tốc độ bằng 0 hoặc âm (thiết bị đứng yên hoặc dữ liệu lỗi)
    if (payload.speed <= 0) return;

    try {
      // Tối ưu: cache giới hạn tốc độ của thiết bị trong Redis 5 phút để đỡ query DB
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

      // Check cooldown trong Redis để tránh spam cảnh báo
      const cooldownKey = `speeding:${deviceId}`;
      const alreadyAlerted = await this.redisService.get(cooldownKey);
      if (alreadyAlerted) return;

      // Tạo alert SPEEDING
      await this.alertsService.create({
        deviceId,
        alertType: AlertType.SPEEDING,
        message: `Vận tốc ${payload.speed.toFixed(1)} km/h vượt ngưỡng ${speedLimitKmh} km/h`,
        lat: payload.lat,
        lng: payload.lng,
      });

      // Set cooldown để không gửi thêm alert khác trong khoảng thời gian này
      await this.redisService.setex(
        cooldownKey,
        SPEEDING_COOLDOWN_SECONDS,
        '1',
      );

      this.logger.warn(
        `SPEEDING detected for device ${deviceId}: ${payload.speed.toFixed(1)} km/h > ${speedLimitKmh} km/h`,
      );

    } catch (error) {
      // Lỗi check tốc độ không được làm gián đoạn luồng xử lý telemetry
      this.logger.warn(
        `Speed check failed for device ${deviceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Kiểm tra thiết bị có ra/vào geofence được gán không.
   * Tận dụng truy vấn không gian PostGIS phía server qua GeofencesService.
   *
   * @param deviceId - UUID của thiết bị
   * @param payload - Payload tọa độ
   */
  private async checkGeofenceViolation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    try {
      // Đánh giá các rule geofence đã gán, chỉ trả về vi phạm mới phát sinh (transition)
      const violations = await this.geofencesService.evaluateGeofenceTransitions(
        deviceId,
        payload.lat,
        payload.lng,
      );

      if (!violations || violations.length === 0) return;

      // Với mỗi geofence bị vi phạm, check cooldown rồi mới bắn alert
      for (const violation of violations) {
        const { geofence, alertType } = violation;
        const cooldownKey = `${alertType}:${deviceId}:${geofence.id}`;
        const alreadyAlerted = await this.redisService.get(cooldownKey);

        if (alreadyAlerted) continue; // Đã gửi alert gần đây rồi, bỏ qua

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

        // Set cooldown (5 phút = 300s) để tránh spam email cảnh báo
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
      // Lỗi check geofence không được làm gián đoạn luồng xử lý telemetry
      this.logger.warn(
        `Geofence check failed for device ${deviceId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Kiểm tra thiết bị có đi lệch khỏi tuyến đường đang active không.
   */
  private async checkRouteDeviation(
    deviceId: string,
    payload: CoordinatePayload,
  ): Promise<void> {
    await this.routeDeviationService.checkDeviation(deviceId, payload);
  }
}
