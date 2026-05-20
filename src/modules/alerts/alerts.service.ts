import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert, AlertType } from './entities/alert.entity';
import { CreateAlertDto, GetAlertsQueryDto, ResolveAlertDto } from './dtos/alert.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { LoggerService } from '@/commons/logger/logger.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { KafkaService } from '@/services/kafka/kafka.service';
import { MqttService } from '@/services/mqtt/mqtt.service';
import { Device } from '@/modules/devices/entities/device.entity';

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new LoggerService(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    private readonly kafkaService: KafkaService,
    private readonly mqttService: MqttService,
  ) {}

  async onModuleInit() {
    // Consumer 1: Telemetry-based alert detection (geofence, anomaly)
    await this.kafkaService.consumeBatch(
      'device-telemetry-events',
      'alerts-detector-group',
      async (payload) => {
        await Promise.resolve();
        const batch = payload.batch;
        // In a real scenario, you'll cross-check telemetry batch against Redis or DB geofences
        // Here we just log to indicate the pipeline is wired up and ready for alert evaluation
        this.logger.log(`Received batch of ${batch.messages.length} telemetry points for Alert evaluation`);
        
        for (const message of batch.messages) {
          if (!message.value) continue;
          try {
            // Evaluator logic (TODO)
            // const payload = JSON.parse(message.value.toString());
            // if (isOutdated(payload) || isBreachingGeofence(payload)) { ... }
          } catch {
            // ignore JSON errors from bad streams
          }
        }
      }
    );

    // Consumer 2: Urgent device events (SOS, collision, power loss)
    // These come from the new 'device-events' Kafka topic (produced by MqttService)
    await this.kafkaService.consumeBatch(
      'device-events',
      'device-events-alert-group',
      async (payload) => {
        const batch = payload.batch;

        for (const message of batch.messages) {
          if (!message.value) continue;

          try {
            const deviceId = message.key?.toString();
            if (!deviceId) continue;

            const event = JSON.parse(message.value.toString()) as {
              eventType?: string;
              timestamp?: string;
              severity?: string;
              metadata?: { lat?: number; lng?: number; speed_kmh?: number };
            };

            // Auto-create an alert from the device event
            const alert = await this.create({
              deviceId,
              alertType: this.mapEventToAlertType(event.eventType),
              message: `Device event: ${event.eventType} (severity: ${event.severity || 'unknown'})`,
              lat: event.metadata?.lat,
              lng: event.metadata?.lng,
            });

            this.logger.log(`Auto-created alert ${alert.id} from device event: ${event.eventType}`);
          } catch (e) {
            this.logger.error('Failed to process device event for alert creation', e);
          }
        }
      }
    );
  }

  /**
   * Create an alert and push real-time notification to the device owner via MQTT.
   */
  async create(dto: CreateAlertDto): Promise<Alert> {
    const entity = this.alertRepo.create(dto);
    const savedAlert = await this.alertRepo.save(entity);

    // Push real-time notification via MQTT to the device owner
    await this.pushAlertToOwner(savedAlert);

    return savedAlert;
  }

  async findAll(query: GetAlertsQueryDto): Promise<GetManyBaseResponseDto<Alert>> {
    const { page, limit, deviceId, alertType, isResolved, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};
    if (deviceId) where.deviceId = deviceId;
    if (alertType) where.alertType = alertType;
    if (isResolved !== undefined) where.isResolved = isResolved;

    const allowedSort = ['timestamp', 'createdAt', 'alertType'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'timestamp';

    const [data, total] = await this.alertRepo.findAndCount({
      where,
      order: { [safeSortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['device'],
    });

    return getManyResponse({ query, data, total });
  }

  async findOne(id: string): Promise<Alert> {
    const alert = await this.alertRepo.findOne({ where: { id }, relations: ['device'] });
    if (!alert) throw new NotFound(`Alert ${id} not found`);
    return alert;
  }

  async resolve(id: string, dto: ResolveAlertDto): Promise<Alert> {
    await this.findOne(id);
    await this.alertRepo.update(id, { isResolved: dto.isResolved });
    this.logger.log(`Alert ${id} resolved=${dto.isResolved}`);

    const updatedAlert = await this.findOne(id);

    // Notify the owner that the alert has been resolved
    await this.pushAlertToOwner(updatedAlert, 'ALERT_RESOLVED');

    return updatedAlert;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.alertRepo.delete(id);
  }

  // ──────────────────────────────────────────────────────────────
  //  MQTT Push — Real-time notifications to Mobile App
  // ──────────────────────────────────────────────────────────────

  /**
   * Push an alert notification to the device owner's MQTT topic.
   *
   * Topic: `users/{ownerId}/alerts`
   * The mobile app subscribes to this topic to receive real-time alerts.
   */
  private async pushAlertToOwner(alert: Alert, type = 'NEW_ALERT') {
    if (!alert.deviceId) return;

    try {
      // Look up the device to find its owner
      const device = await this.deviceRepo.findOne({
        where: { id: alert.deviceId },
        select: ['id', 'name', 'ownerId'],
      });

      if (!device?.ownerId) {
        this.logger.warn(`Cannot push alert: device ${alert.deviceId} has no owner`);
        return;
      }

      const mqttPayload = {
        type,
        alertId: alert.id,
        deviceId: alert.deviceId,
        deviceName: device.name,
        alertType: alert.alertType,
        message: alert.message,
        lat: alert.lat,
        lng: alert.lng,
        snapshotUrl: alert.snapshotUrl,
        isResolved: alert.isResolved,
        timestamp: alert.timestamp,
      };

      this.mqttService.publish(`users/${device.ownerId}/alerts`, mqttPayload);
      this.logger.log(`Pushed ${type} to users/${device.ownerId}/alerts (alert=${alert.id})`);
    } catch (e) {
      // Non-blocking: MQTT push failure should not break alert creation
      this.logger.error(`Failed to push alert ${alert.id} via MQTT`, e);
    }
  }

  /**
   * Map device event types to alert types.
   */
  private mapEventToAlertType(eventType?: string): AlertType {
    const mapping: Record<string, AlertType> = {
      'sos_button_pressed': AlertType.SIGNAL_LOST,
      'collision_detected': AlertType.DANGEROUS_OBSTACLE,
      'power_loss': AlertType.SIGNAL_LOST,
      'geofence_breach': AlertType.GEOFENCE_BREACH,
      'trajectory_deviation': AlertType.TRAJECTORY_DEVIATION,
    };
    return mapping[eventType || ''] || AlertType.SIGNAL_LOST;
  }
}

