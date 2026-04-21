import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as mqtt from 'mqtt';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopic } from '@/services/kafka/kafka.enum';
import type {
  MqttCoordinatesPayload,
  MqttAlertPayload,
} from './mqtt.interface';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(private readonly kafkaService: KafkaService) {}

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
      this.client.subscribe('gnss/+/image');
      this.client.subscribe('gnss/+/video');
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

    switch (dataType) {
      case 'coordinates':
        await this.forwardCoordinates(deviceId, payload);
        break;
      case 'alert':
        await this.forwardAlert(deviceId, payload);
        break;
      case 'image':
      case 'video':
        await this.forwardMedia(deviceId, dataType, payload);
        break;
    }
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
      await this.kafkaService.produce(KafkaTopic.GNSS_COORDINATES, [
        {
          key: deviceId,
          value: {
            deviceId,
            lng: data.lng,
            lat: data.lat,
            speed: data.speed,
            heading: data.heading,
            altitude: data.altitude,
            timestamp: data.timestamp,
          },
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
      await this.kafkaService.produce(KafkaTopic.GNSS_ALERTS, [
        {
          key: deviceId,
          value: {
            deviceId,
            type: data.type,
            severity: data.severity,
            message: data.message,
            location: { lng: data.lng, lat: data.lat },
            timestamp: data.timestamp,
          },
        },
      ]);
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Failed to parse alert payload: ${error.message}`);
    }
  }

  /**
   * Encodes raw binary media (image/video) as Base64 and produces it
   * to the GNSS_MEDIA_UPLOAD Kafka topic for downstream storage processing.
   *
   * @param deviceId  - Device identifier extracted from the MQTT topic
   * @param mediaType - 'image' | 'video'
   * @param payload   - Raw binary buffer from the device camera
   */
  private async forwardMedia(
    deviceId: string,
    mediaType: 'image' | 'video',
    payload: Buffer,
  ): Promise<void> {
    await this.kafkaService.produce(KafkaTopic.GNSS_MEDIA_UPLOAD, [
      {
        key: deviceId,
        value: {
          deviceId,
          mediaType,
          // Encode buffer as Base64 for transport over Kafka
          data: payload.toString('base64'),
          mimeType: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
          timestamp: new Date().toISOString(),
        },
      },
    ]);
  }
}
