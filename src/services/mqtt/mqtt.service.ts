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
   * Initialises the MQTT client, subscribes to all GNSS device topics,
   * and wires the message dispatcher.
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
      // Subscribe to all GNSS device topics using single-level wildcard
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
   * Gracefully closes the MQTT connection on module teardown.
   */
  onModuleDestroy(): void {
    this.client?.end();
  }

  /**
   * Routes incoming MQTT messages to the correct Kafka producer
   * based on the topic's data-type segment.
   *
   * @param topic - Full MQTT topic string, e.g. "gnss/abc123/coordinates"
   * @param payload - Raw binary payload from the device
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
   * Publishes a JSON command to an MQTT topic.
   *
   * @param topic - Full MQTT topic
   * @param value - JSON-serializable command payload
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
   * Parses a GPS coordinate payload and produces it to the GNSS_COORDINATES Kafka topic.
   *
   * @param deviceId - Device identifier extracted from the MQTT topic
   * @param payload  - Raw JSON buffer from the device
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
   * Parses a device alert payload and produces it to the GNSS_ALERTS Kafka topic.
   *
   * @param deviceId - Device identifier extracted from the MQTT topic
   * @param payload  - Raw JSON buffer from the device
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
   * Parses a device status heartbeat payload and produces it to the GNSS_DEVICE_STATUS Kafka topic.
   *
   * @param deviceId - Device identifier extracted from the MQTT topic
   * @param payload  - Raw JSON buffer from the device
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
   * Forwards media data to Kafka for async processing.
   * Supports two payload formats from devices:
   * 1. **Raw binary** (JPEG/MP4 bytes) → Base64-encodes for Kafka transport
   * 2. **JSON with embedded Base64** → passes through the pre-encoded `data` field
   *
   * @param deviceId  - Device identifier extracted from the MQTT topic
   * @param mediaType - 'image' | 'video'
   * @param payload   - Raw buffer from the MQTT message
   */
  private async forwardMedia(
    deviceId: string,
    mediaType: 'image' | 'video',
    payload: Buffer,
  ): Promise<void> {
    // Step 1: Attempt to parse as JSON (device may send structured payload)
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

      // If the payload is JSON with a pre-encoded Base64 `data` field, use it directly
      if (parsed.data) {
        data = parsed.data;
        mimeType = parsed.mimeType || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
        timestamp = parsed.timestamp || new Date().toISOString();
        snapshotId = parsed.snapshotId;
      } else {
        // JSON payload without `data` field — encode the entire buffer
        data = payload.toString('base64');
        mimeType = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
        timestamp = new Date().toISOString();
        snapshotId = parsed.snapshotId;
      }
    } catch {
      // Step 2: Not valid JSON — treat as raw binary (JPEG/MP4 bytes)
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
