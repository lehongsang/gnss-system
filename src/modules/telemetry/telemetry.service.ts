import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AccuracyStatus, Telemetry } from './entities/telemetry.entity';
import { CreateTelemetryDto, GetTelemetryQueryDto } from './dtos/telemetry.dto';
import { LoggerService } from '@/commons/logger/logger.service';
import { KafkaService } from '@/services/kafka/kafka.service';

interface TelemetryKafkaPayload {
  deviceId?: string;
  lat?: number;
  lng?: number;
  alt?: number;
  accuracyStatus?: AccuracyStatus;
}

@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = new LoggerService(TelemetryService.name);

  constructor(
    @InjectRepository(Telemetry)
    private readonly telemetryRepo: Repository<Telemetry>,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    // Subscribe to incoming Kafka telemetry events in batches
    await this.kafkaService.consumeBatch(
      'device-telemetry-events',
      'telemetry-persister-group',
      async ({ batch }) => {
        const dtos: CreateTelemetryDto[] = [];
        
        for (const message of batch.messages) {
          if (!message.value) continue;
          
          try {
            const raw = message.value.toString();
            // Assuming the MQTT message is {"lat": ..., "lng": ...}
            // And Kafka key is the deviceId
            const payload = JSON.parse(raw) as TelemetryKafkaPayload;
            const deviceId = message.key?.toString() || payload.deviceId;
            
            if (!deviceId || payload.lat === undefined || payload.lat === null || payload.lng === undefined || payload.lng === null) {
              this.logger.warn(`Invalid telemetry payload from Kafka: ${raw}`);
              continue;
            }

            dtos.push({
              deviceId,
              lat: payload.lat,
              lng: payload.lng,
              alt: payload.alt,
              accuracyStatus: payload.accuracyStatus,
            });
          } catch (e) {
            this.logger.error(`Error parsing telemetry kafka message: ${e}`);
          }
        }
        
        if (dtos.length > 0) {
          await this.createBatch(dtos);
        }
      }
    );
  }

  /**
   * Ingest a single telemetry point.
   * geom is built as PostGIS WKT from lat/lng.
   */
  async create(dto: CreateTelemetryDto): Promise<Telemetry> {
    const entity = this.telemetryRepo.create({
      ...dto,
      timestamp: new Date(),
      geom: `SRID=4326;POINT(${dto.lng} ${dto.lat})`,
    });
    return this.telemetryRepo.save(entity);
  }

  /**
   * Batch ingest – for high-frequency streaming.
   */
  async createBatch(dtos: CreateTelemetryDto[]): Promise<void> {
    const entities = dtos.map((dto) =>
      this.telemetryRepo.create({
        ...dto,
        timestamp: new Date(),
        geom: `SRID=4326;POINT(${dto.lng} ${dto.lat})`,
      }),
    );
    await this.telemetryRepo.save(entities);
    this.logger.log(`Batch inserted ${entities.length} telemetry records`);
  }

  /**
   * Get telemetry for a device within a time range.
   */
  async findByDevice(query: GetTelemetryQueryDto): Promise<Telemetry[]> {
    const { deviceId, from, limit } = query;
    const to = query.to;

    const where: Record<string, unknown> = { deviceId };

    if (from && to) {
      where.timestamp = Between(new Date(from), new Date(to));
    } else if (from) {
      where.timestamp = Between(new Date(from), new Date());
    }

    return this.telemetryRepo.find({
      where,
      order: { timestamp: 'DESC' },
      take: limit ?? 500,
    });
  }

  /**
   * Get the latest telemetry record for a device.
   */
  async findLatest(deviceId: string): Promise<Telemetry | null> {
    return this.telemetryRepo.findOne({
      where: { deviceId },
      order: { timestamp: 'DESC' },
    });
  }
}
