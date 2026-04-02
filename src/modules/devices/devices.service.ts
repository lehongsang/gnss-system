import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Device, DeviceStatus } from './entities/device.entity';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import { GetDevicesQueryDto } from './dtos/get-devices-query.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { LoggerService } from '@/commons/logger/logger.service';
import { KafkaService } from '@/services/kafka/kafka.service';

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new LoggerService(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly devicesRepository: Repository<Device>,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    await this.kafkaService.consumeBatch(
      'device-telemetry-events',
      'devices-status-updater',
      async (payload) => {
        const batch = payload.batch;
        const onlineDeviceIds = new Set<string>();

        // Extract unique active devices from batch
        for (const message of batch.messages) {
          if (!message.value) continue;
          try {
            // deviceId could be in key, or payload
            const raw = message.value.toString();
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const deviceId = message.key?.toString() || (typeof parsed.deviceId === 'string' ? parsed.deviceId : null);
            if (deviceId) {
              onlineDeviceIds.add(deviceId);
            }
          } catch {
            // ignore bad JSON
          }
        }

        if (onlineDeviceIds.size > 0) {
          try {
            await this.devicesRepository.update(
              Array.from(onlineDeviceIds),
              { status: DeviceStatus.ONLINE }
            );
          } catch (e) {
            this.logger.error('Failed to update device statuses', e);
          }
        }
      }
    );
  }

  /**
   * Creates a new device.
   */
  async create(dto: CreateDeviceDto): Promise<Device> {
    const device = this.devicesRepository.create(dto);
    return this.devicesRepository.save(device);
  }

  /**
   * Returns [data, total] tuple for use with getManyResponse in the controller.
   */
  async findAll(query: GetDevicesQueryDto): Promise<[Device[], number]> {
    const { page, limit, search, sortBy, sortOrder, status, ownerId, name } = query;

    const trimmedSearch = search?.trim();
    const trimmedName = name?.trim();
    const nameFilter = trimmedName ?? trimmedSearch;

    const where: Record<string, unknown> = {};

    if (nameFilter) {
      where.name = ILike(`%${nameFilter}%`);
    }
    if (status) {
      where.status = status;
    }
    if (ownerId) {
      where.ownerId = ownerId;
    }

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'status', 'batteryLevel'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    return this.devicesRepository.findAndCount({
      where,
      order: { [safeSortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['owner'],
    });
  }

  /**
   * Returns a single device by ID.
   */
  async findOne(id: string): Promise<Device> {
    const device = await this.devicesRepository.findOne({
      where: { id },
      relations: ['owner'],
    });

    if (!device) {
      throw new NotFound(`Device with id ${id} not found`);
    }

    return device;
  }

  /**
   * Updates a device by ID.
   */
  async update(id: string, dto: UpdateDeviceDto): Promise<Device> {
    await this.findOne(id);
    await this.devicesRepository.update(id, dto);
    return this.findOne(id);
  }

  /**
   * Removes a device by ID.
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.devicesRepository.delete(id);
    this.logger.log(`Device ${id} deleted`);
  }
}
