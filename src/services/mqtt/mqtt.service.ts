import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { LoggerService } from '@/commons/logger/logger.service';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new LoggerService(MqttService.name);
  private client: mqtt.MqttClient;

  // You can refine this topic pattern based on your requirements
  private readonly INCOMING_TELEMETRY_TOPIC = 'devices/+/telemetry';
  private readonly KAFKA_TELEMETRY_TOPIC = 'device-telemetry-events';

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('MQTT Client disconnected');
    }
  }

  private connect() {
    // Determine EMQX URL from Config
    const emqxHost = this.configService.get<string>('MQTT_HOST', 'localhost');
    const emqxPort = this.configService.get<string>('MQTT_PORT', '1883');
    const url = `mqtt://${emqxHost}:${emqxPort}`;

    this.logger.log(`Connecting to EMQX at ${url}`);

    this.client = mqtt.connect(url, {
      clientId: `nest-backend-${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to EMQX Broker');
      
      // Subscribe to telemetry topic
      this.client.subscribe(this.INCOMING_TELEMETRY_TOPIC, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${this.INCOMING_TELEMETRY_TOPIC}`, err);
        } else {
          this.logger.log(`Subscribed to topic: ${this.INCOMING_TELEMETRY_TOPIC}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      // Forward data to Kafka
      this.handleIncomingMessage(topic, payload).catch(err => {
        this.logger.error(`Promise rejection in handleIncomingMessage: ${err}`, err);
      });
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT Client Error', err);
    });
  }

  private async handleIncomingMessage(topic: string, payload: Buffer) {
    try {
      const messageStr = payload.toString();
      
      // Example matching mechanism to extract deviceId
      const parts = topic.split('/');
      const deviceId = parts[1]; // e.g. devices/{deviceId}/telemetry
      
      // Send message to Kafka
      await this.kafkaService.produce(this.KAFKA_TELEMETRY_TOPIC, [
        {
          key: deviceId,    // Using deviceId as Kafka Key for orderly partitioned processing
          value: messageStr,
        },
      ]);
      
    } catch (e) {
      this.logger.error(`Failed to forward message from ${topic} to Kafka: ${e}`, e);
    }
  }
  
  // Method to publish messages back to devices if needed (e.g. Configuration update commands)
  publishCommand(deviceId: string, command: string, payload: unknown) {
    const topic = `devices/${deviceId}/commands/${command}`;
    if (this.client && this.client.connected) {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
      this.logger.log(`Published command to ${topic}`);
    } else {
      this.logger.error(`Cannot publish to ${topic}. MQTT Client not connected.`);
    }
  }
}
