import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { KafkaService } from '../kafka/kafka.service';

interface CoordinatesPayload {
  lng: number;
  lat: number;
  speed: number;
  heading: number;
  altitude: number;
  timestamp: string;
}

interface AlertPayload {
  type: string;
  severity: string;
  message: string;
  lng: number;
  lat: number;
  timestamp: string;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  onModuleInit() {
    this.client = mqtt.connect({
      host: process.env.MQTT_HOST || 'localhost',
      port: Number(process.env.MQTT_PORT) || 1883,
      clientId: process.env.MQTT_CLIENT_ID || 'gnss-gateway',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      protocol: (process.env.MQTT_PROTOCOL as 'mqtt' | 'mqtts') || 'mqtt',
    });

    this.client.on('connect', () => {
      // Subscribe toàn bộ topic gnss
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

  onModuleDestroy() {
    this.client?.end();
  }

  private async handleMessage(topic: string, payload: Buffer) {
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

  private async forwardCoordinates(deviceId: string, payload: Buffer) {
    try {
      const data = JSON.parse(payload.toString()) as CoordinatesPayload;
      await this.kafkaService.produce('gnss.coordinates', [
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
      this.logger.error(`Failed to parse coordinates payload: ${error.message}`);
    }
  }

  private async forwardAlert(deviceId: string, payload: Buffer) {
    try {
      const data = JSON.parse(payload.toString()) as AlertPayload;
      await this.kafkaService.produce('gnss.alerts', [
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

  private async forwardMedia(
    deviceId: string,
    mediaType: 'image' | 'video',
    payload: Buffer,
  ) {
    await this.kafkaService.produce('gnss.media.upload', [
      {
        key: deviceId,
        value: {
          deviceId,
          mediaType,
          // Encode buffer thành Base64 để truyền qua Kafka
          data: payload.toString('base64'),
          mimeType: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
          timestamp: new Date().toISOString(),
        },
      },
    ]);
  }
}
