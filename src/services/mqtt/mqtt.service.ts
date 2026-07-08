import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopic } from '@/services/kafka/kafka.enum';
import { RedisService } from '@/services/redis/redis.service';
import { MediaServerService } from '@/services/media-server/media-server.service';
import { GnssKafkaEnvelope } from '@/commons/interfaces/app.interface';
import {
  DeviceStreamStatusPayload,
  LiveStreamSession,
  LiveStreamStatus,
} from '@/commons/interfaces/live-stream.interface';
import type {
  MqttCoordinatesPayload,
  MqttAlertPayload,
  MqttDeviceStatusPayload,
} from './mqtt.interface';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly redisService: RedisService,
    private readonly mediaServerService: MediaServerService,
  ) {}

  /**
   * Khởi tạo MQTT client, subscribe vào tất cả topic của thiết bị GNSS
   * và gắn hàm dispatch xử lý message.
   */
  onModuleInit(): void {
    this.client = mqtt.connect({
      host: process.env.MQTT_HOST || 'localhost',
      port: Number(process.env.MQTT_PORT) || 1883,
      clientId: process.env.MQTT_CLIENT_ID || 'gnss-gateway',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      protocol: (process.env.MQTT_PROTOCOL as 'mqtt' | 'mqtts') || 'mqtt',
    });

    this.client.on('connect', () => {
      // Subscribe tất cả topic thiết bị GNSS bằng wildcard 1 cấp (+)
      this.client.subscribe('gnss/+/coordinates');
      this.client.subscribe('gnss/+/alert');
      this.client.subscribe('gnss/+/status');
      this.client.subscribe('gnss/+/image');
      this.client.subscribe('gnss/+/video');
      this.client.subscribe('gnss/+/stream/status');
      this.logger.log('Connected to MQTT Broker and subscribed to gnss topics');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload).catch((err: unknown) => {
        this.logger.error(`Error handling message on topic ${topic}`, err);
      });
    });

    this.client.on('error', (error) => {
      this.logger.error('MQTT Client Error:', error);
    });
  }

  /**
   * Đóng kết nối MQTT một cách an toàn khi module bị destroy.
   */
  onModuleDestroy(): void {
    this.client?.end();
  }

  /**
   * Điều hướng message MQTT tới đúng Kafka producer dựa vào phần data-type trong topic.
   *
   * @param topic - Chuỗi topic MQTT đầy đủ, ví dụ "gnss/abc123/coordinates"
   * @param payload - Payload dạng binary thô từ thiết bị
   */
  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const segments = topic.split('/');
    const deviceId = segments[1];
    const dataType = segments[2];
    const subType = segments[3];

    switch (dataType) {
      case 'coordinates':
        await this.forwardCoordinates(deviceId, payload);
        break;
      case 'alert':
        await this.forwardAlert(deviceId, payload);
        break;
      case 'status':
        await this.forwardStatus(deviceId, payload);
        break;
      case 'image':
      case 'video':
        await this.forwardMedia(deviceId, dataType, payload);
        break;
      case 'stream':
        if (subType === 'status') {
          await this.handleStreamStatus(deviceId, payload);
        }
        break;
    }
  }

  /**
   * Publish một lệnh dạng JSON tới MQTT topic.
   *
   * @param topic - Topic MQTT đầy đủ
   * @param value - Payload lệnh có thể serialize sang JSON
   */
  async publishJson(topic: string, value: Record<string, unknown>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.publish(
        topic,
        JSON.stringify(value),
        { qos: 1, retain: false },
        (error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  }

  /**
   * Parse payload tọa độ GPS và đẩy vào Kafka topic GNSS_COORDINATES.
   *
   * @param deviceId - ID thiết bị trích xuất từ topic MQTT
   * @param payload  - Buffer JSON thô từ thiết bị
   */
  private async forwardCoordinates(
    deviceId: string,
    payload: Buffer,
  ): Promise<void> {
    try {
      const data = JSON.parse(payload.toString()) as MqttCoordinatesPayload;
      const envelope: GnssKafkaEnvelope = {
        correlationId: randomUUID(),
        deviceId,
        receivedAt: new Date().toISOString(),
        retryCount: 0,
        payload: {
          deviceId,
          lng: data.lng,
          lat: data.lat,
          speed: data.speed,
          heading: data.heading,
          timestamp: data.timestamp,
        },
      };

      await this.kafkaService.produce(KafkaTopic.GNSS_COORDINATES, [
        {
          key: deviceId,
          value: JSON.stringify(envelope),
        },
      ]);
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `Failed to parse coordinates payload: ${error.message}`,
      );
    }
  }

  /**
   * Parse payload cảnh báo từ thiết bị và đẩy vào Kafka topic GNSS_ALERTS.
   *
   * @param deviceId - ID thiết bị trích xuất từ topic MQTT
   * @param payload  - Buffer JSON thô từ thiết bị
   */
  private async forwardAlert(
    deviceId: string,
    payload: Buffer,
  ): Promise<void> {
    try {
      const data = JSON.parse(payload.toString()) as MqttAlertPayload;
      const envelope: GnssKafkaEnvelope = {
        correlationId: randomUUID(),
        deviceId,
        receivedAt: new Date().toISOString(),
        retryCount: 0,
        payload: {
          deviceId,
          type: data.type,
          severity: data.severity,
          message: data.message,
          location: { lng: data.lng, lat: data.lat },
          timestamp: data.timestamp,
          snapshotId: data.snapshotId,
        },
      };

      await this.kafkaService.produce(KafkaTopic.GNSS_ALERTS, [
        {
          key: deviceId,
          value: JSON.stringify(envelope),
        },
      ]);
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Failed to parse alert payload: ${error.message}`);
    }
  }

  /**
   * Parse payload heartbeat trạng thái thiết bị và đẩy vào Kafka topic GNSS_DEVICE_STATUS.
   *
   * @param deviceId - ID thiết bị trích xuất từ topic MQTT
   * @param payload  - Buffer JSON thô từ thiết bị
   */
  private async forwardStatus(
    deviceId: string,
    payload: Buffer,
  ): Promise<void> {
    try {
      const data = JSON.parse(payload.toString()) as MqttDeviceStatusPayload;
      const envelope: GnssKafkaEnvelope = {
        correlationId: randomUUID(),
        deviceId,
        receivedAt: new Date().toISOString(),
        retryCount: 0,
        payload: {
          deviceId,
          status: data.status,
          batteryLevel: data.batteryLevel,
          cameraStatus: data.cameraStatus,
          gnssStatus: data.gnssStatus,
          satellitesTracked: data.satellitesTracked,
          signalStrength: data.signalStrength,
        },
      };

      await this.kafkaService.produce(KafkaTopic.GNSS_DEVICE_STATUS, [
        {
          key: deviceId,
          value: JSON.stringify(envelope),
        },
      ]);
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Failed to parse status payload: ${error.message}`);
    }
  }

  /**
   * Chuyển tiếp dữ liệu media sang Kafka để xử lý bất đồng bộ.
   * Hỗ trợ 2 định dạng payload từ thiết bị:
   * 1. **Binary thô** (bytes JPEG/MP4) → encode Base64 để truyền qua Kafka
   * 2. **JSON kèm Base64 sẵn** → dùng luôn field `data` đã được encode sẵn
   *
   * @param deviceId  - ID thiết bị trích xuất từ topic MQTT
   * @param mediaType - 'image' | 'video'
   * @param payload   - Buffer thô từ message MQTT
   */
  private async forwardMedia(
    deviceId: string,
    mediaType: 'image' | 'video',
    payload: Buffer,
  ): Promise<void> {
    // Bước 1: Thử parse như JSON (thiết bị có thể gửi payload có cấu trúc)
    let data: string;
    let mimeType: string;
    let timestamp: string;
    let snapshotId: string | undefined;

    try {
      const parsed = JSON.parse(payload.toString()) as {
        data?: string;
        mimeType?: string;
        timestamp?: string;
        snapshotId?: string;
      };

      // Nếu payload là JSON có sẵn field `data` dạng Base64 thì dùng thẳng
      if (parsed.data) {
        data = parsed.data;
        mimeType = parsed.mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        timestamp = parsed.timestamp || new Date().toISOString();
        snapshotId = parsed.snapshotId;
      } else {
        // JSON hợp lệ nhưng không có field `data` — encode toàn bộ buffer
        data = payload.toString('base64');
        mimeType = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
        timestamp = new Date().toISOString();
        snapshotId = parsed.snapshotId;
      }
    } catch {
      // Bước 2: Không phải JSON hợp lệ — coi như binary thô (bytes JPEG/MP4)
      data = payload.toString('base64');
      mimeType = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
      timestamp = new Date().toISOString();
    }

    const envelope: GnssKafkaEnvelope = {
      correlationId: randomUUID(),
      deviceId,
      receivedAt: new Date().toISOString(),
      retryCount: 0,
      payload: {
        deviceId,
        mediaType,
        data,
        mimeType,
        timestamp,
        snapshotId,
      },
    };

    await this.kafkaService.produce(KafkaTopic.GNSS_MEDIA_UPLOAD, [
      {
        key: deviceId,
        value: JSON.stringify(envelope),
      },
    ]);
  }

  private async handleStreamStatus(
    deviceId: string,
    payload: Buffer,
  ): Promise<void> {
    try {
      const data = JSON.parse(
        payload.toString(),
      ) as DeviceStreamStatusPayload;
      const key = `live-stream:${deviceId}`;
      const existing = await this.redisService.get(key);
      const currentSession = existing
        ? (JSON.parse(existing) as LiveStreamSession)
        : null;

      // Chỉ chấp nhận status khớp với requestId đang lưu trong Redis, tránh xử lý
      // nhầm session cũ đã hết hạn hoặc request đã bị thay thế bởi request mới hơn
      if (!currentSession || currentSession.requestId !== data.requestId) {
        this.logger.warn(
          `Ignoring stream status for unknown request ${data.requestId} from device ${deviceId}`,
        );
        return;
      }

      const path = this.mediaServerService.buildPath(deviceId);
      if (data.status === LiveStreamStatus.READY && data.rtspUrl) {
        await this.mediaServerService.registerRtspSource(path, data.rtspUrl);
      }
      const updatedSession: LiveStreamSession = {
        ...currentSession,
        status: data.status,
        rtspUrl: data.rtspUrl ?? currentSession.rtspUrl,
        webrtcUrl:
          data.status === LiveStreamStatus.READY
            ? this.mediaServerService.buildWebRtcUrl(path)
            : currentSession.webrtcUrl,
        errorMessage: data.errorMessage,
      };

      // TTL tính theo thời gian còn lại tới lúc session hết hạn, tối thiểu 60s để
      // tránh key bị xóa ngay lập tức nếu expiresAt đã gần hết hạn
      const ttlSeconds = Math.max(
        Math.ceil(
          (new Date(updatedSession.expiresAt).getTime() - Date.now()) / 1000,
        ),
        60,
      );
      await this.redisService.setex(
        key,
        ttlSeconds,
        JSON.stringify(updatedSession),
      );

      this.logger.log(
        `Updated live stream session ${data.requestId} for device ${deviceId}: ${data.status}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process stream status: ${message}`);
    }
  }

}
