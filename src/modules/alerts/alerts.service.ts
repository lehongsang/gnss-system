import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto, GetAlertsQueryDto, ResolveAlertDto } from './dtos/alert.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { LoggerService } from '@/commons/logger/logger.service';
import { getManyResponse } from '@/utils/getManyResponse';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { KafkaService } from '@/services/kafka/kafka.service';

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new LoggerService(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    // Subscribe to incoming telemetry to perform anomaly/geofence detection
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
  }

  async create(dto: CreateAlertDto): Promise<Alert> {
    const entity = this.alertRepo.create(dto);
    return this.alertRepo.save(entity);
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
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.alertRepo.delete(id);
  }
}
