import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { LoggerService } from '@/commons/logger/logger.service';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new LoggerService(MqttService.name);
  private client: mqtt.MqttClient;

  // Topic patterns the backend subscribes to
  private readonly TOPIC_TELEMETRY = 'devices/+/telemetry';
  private readonly TOPIC_EVENTS = 'devices/+/events';
  private readonly TOPIC_COMMAND_REPLY = 'devices/+/commands/reply';
  private readonly TOPIC_LOGS = 'devices/+/logs';

  // Kafka topics
  private readonly KAFKA_TELEMETRY_TOPIC = 'device-telemetry-events';
  private readonly KAFKA_DEVICE_EVENTS_TOPIC = 'device-events';

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

      // Subscribe to all device topics
      const topics = [
        this.TOPIC_TELEMETRY,
        this.TOPIC_EVENTS,
        this.TOPIC_COMMAND_REPLY,
        this.TOPIC_LOGS,
      ];

      this.client.subscribe(topics, (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to topics', err);
        } else {
          this.logger.log(`Subscribed to topics: ${topics.join(', ')}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      this.routeMessage(topic, payload).catch(err => {
        this.logger.error(`Error handling message from ${topic}: ${err}`, err);
      });
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT Client Error', err);
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Message Router — dispatches messages based on topic pattern
  // ──────────────────────────────────────────────────────────────

  private async routeMessage(topic: string, payload: Buffer) {
    const parts = topic.split('/');
    const deviceId = parts[1]; // devices/{deviceId}/...
    const messageType = parts[2]; // telemetry | events | commands | logs

    switch (messageType) {
      case 'telemetry':
        await this.handleTelemetry(deviceId, payload);
        break;
      case 'events':
        await this.handleDeviceEvent(deviceId, payload);
        break;
      case 'commands':
        // devices/{deviceId}/commands/reply
        if (parts[3] === 'reply') {
          this.handleCommandReply(deviceId, payload);
        }
        break;
      case 'logs':
        this.handleDeviceLog(deviceId, payload);
        break;
      default:
        this.logger.warn(`Unknown topic pattern: ${topic}`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Handlers
  // ──────────────────────────────────────────────────────────────

  /**
   * Forward telemetry data to Kafka for batch processing
   * by TelemetryService, DevicesService, and AlertsService.
   */
  private async handleTelemetry(deviceId: string, payload: Buffer) {
    try {
      await this.kafkaService.produce(this.KAFKA_TELEMETRY_TOPIC, [
        {
          key: deviceId,
          value: payload.toString(),
        },
      ]);
    } catch (e) {
      this.logger.error(`Failed to forward telemetry for ${deviceId} to Kafka: ${e}`, e);
    }
  }

  /**
   * Handle urgent device events (SOS, collision, power loss, etc.)
   * Forward to a dedicated Kafka topic for immediate alert processing.
   */
  private async handleDeviceEvent(deviceId: string, payload: Buffer) {
    try {
      const messageStr = payload.toString();
      this.logger.log(`Device event from ${deviceId}: ${messageStr}`);

      await this.kafkaService.produce(this.KAFKA_DEVICE_EVENTS_TOPIC, [
        {
          key: deviceId,
          value: messageStr,
        },
      ]);
    } catch (e) {
      this.logger.error(`Failed to process event from ${deviceId}: ${e}`, e);
    }
  }

  /**
   * Handle command acknowledgements from devices.
   * Logs the result so operators can verify command delivery.
   */
  private handleCommandReply(deviceId: string, payload: Buffer) {
    try {
      const reply = JSON.parse(payload.toString()) as {
        commandId?: string;
        status?: string;
        message?: string;
      };
      this.logger.log(
        `Command reply from ${deviceId}: ` +
        `commandId=${reply.commandId}, status=${reply.status}, message=${reply.message}`,
      );
    } catch {
      this.logger.warn(`Invalid command reply JSON from ${deviceId}`);
    }
  }

  /**
   * Handle device debug logs.
   * These are informational messages from firmware for remote diagnostics.
   */
  private handleDeviceLog(deviceId: string, payload: Buffer) {
    const logMessage = payload.toString();
    this.logger.log(`[DeviceLog][${deviceId}] ${logMessage}`);
  }

  // ──────────────────────────────────────────────────────────────
  //  Publish Methods — Backend → Device
  // ──────────────────────────────────────────────────────────────

  /**
   * Send a command to a specific device.
   *
   * @param deviceId Target device UUID.
   * @param command  Command name (e.g. 'capture_media', 'update_config', 'system', 'alarm').
   * @param payload  Command payload (JSON-serializable object).
   */
  publishCommand(deviceId: string, command: string, payload: unknown) {
    const topic = `devices/${deviceId}/commands/${command}`;
    if (this.client && this.client.connected) {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
      this.logger.log(`Published command to ${topic}`);
    } else {
      this.logger.error(`Cannot publish to ${topic}. MQTT Client not connected.`);
    }
  }

  /**
   * Generic publish method for other services to send MQTT messages.
   *
   * @param topic  Full MQTT topic string.
   * @param payload JSON-serializable data.
   * @param qos    QoS level (default: 1).
   */
  publish(topic: string, payload: unknown, qos: 0 | 1 | 2 = 1) {
    if (this.client && this.client.connected) {
      this.client.publish(topic, JSON.stringify(payload), { qos });
      this.logger.log(`Published message to ${topic}`);
    } else {
      this.logger.error(`Cannot publish to ${topic}. MQTT Client not connected.`);
    }
  }
}

