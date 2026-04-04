import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { DeviceStatus as DeviceHealthStatus } from '@/commons/enums/app.enum';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import { GetDevicesQueryDto } from './dtos/get-devices-query.dto';
import { NotFound } from '@/commons/exceptions/business.exceptions';
import { LoggerService } from '@/commons/logger/logger.service';
import { KafkaService } from '@/services/kafka/kafka.service';
import { DeviceStatusEntity } from './entities/device-status.entity';

@Injectable()
export class DevicesService implements OnModuleInit {
  private readonly logger = new LoggerService(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly devicesRepository: Repository<Device>,
    @InjectRepository(DeviceStatusEntity)
    private readonly deviceStatusRepository: Repository<DeviceStatusEntity>,
    private readonly kafkaService: KafkaService,
  ) {}

  private async upsertDeviceStatus(deviceId: string, payload: {
    status: DeviceHealthStatus;
    batteryLevel?: number | null;
    cameraStatus?: boolean | null;
    gnssStatus?: boolean | null;
  }) {
    const { status, batteryLevel, cameraStatus, gnssStatus } = payload;

    // Enforce the validation rule from AGENTS.md.
    if (batteryLevel != null && (batteryLevel < 0 || batteryLevel > 100)) {
      this.logger.warn(`Rejecting invalid battery_level=${batteryLevel} for deviceId=${deviceId}`);
      return;
    }

    await this.deviceStatusRepository.query(
      `
      INSERT INTO device_status (device_id, status, battery_level, camera_status, gnss_status, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (device_id) DO UPDATE SET
        status = EXCLUDED.status,
        battery_level = EXCLUDED.battery_level,
        camera_status = EXCLUDED.camera_status,
        gnss_status = EXCLUDED.gnss_status,
        updated_at = now();
      `,
      [deviceId, status, batteryLevel ?? null, cameraStatus ?? null, gnssStatus ?? null],
    );
  }

  async onModuleInit() {
    await this.kafkaService.consumeBatch(
      'device-telemetry-events',
      'devices-status-updater',
      async (payload) => {
        const batch = payload.batch;

        type IncomingDeviceTelemetryPayload = {
          deviceId?: string;
          battery_level?: number;
          batteryLevel?: number;
          camera_status?: boolean;
          cameraStatus?: boolean;
          gnss_status?: boolean;
          gnssStatus?: boolean;
        };

        const statusByDeviceId = new Map<
          string,
          {
            batteryLevel?: number | null;
            cameraStatus?: boolean | null;
            gnssStatus?: boolean | null;
          }
        >();

        for (const message of batch.messages) {
          if (!message.value) continue;

          try {
            const raw = message.value.toString();
            const parsed = JSON.parse(raw) as IncomingDeviceTelemetryPayload;

            const deviceId =
              message.key?.toString() ||
              (typeof parsed.deviceId === 'string' ? parsed.deviceId : null);

            if (!deviceId) continue;

            statusByDeviceId.set(deviceId, {
              batteryLevel:
                typeof parsed.battery_level === 'number'
                  ? parsed.battery_level
                  : typeof parsed.batteryLevel === 'number'
                    ? parsed.batteryLevel
                    : null,
              cameraStatus:
                typeof parsed.camera_status === 'boolean'
                  ? parsed.camera_status
                  : typeof parsed.cameraStatus === 'boolean'
                    ? parsed.cameraStatus
                    : null,
              gnssStatus:
                typeof parsed.gnss_status === 'boolean'
                  ? parsed.gnss_status
                  : typeof parsed.gnssStatus === 'boolean'
                    ? parsed.gnssStatus
                    : null,
            });
          } catch {
            // ignore bad JSON
          }
        }

        if (statusByDeviceId.size === 0) return;

        // Reject unknown device_id values (AGENTS.md requirement).
        const allDeviceIds = Array.from(statusByDeviceId.keys());
        const existingDevices = await this.devicesRepository.find({
          where: { id: In(allDeviceIds) },
          select: ['id'],
        });
        const existingIds = new Set(existingDevices.map((d) => d.id));

        const upserts: Promise<void>[] = [];
        for (const [deviceId, payload] of statusByDeviceId.entries()) {
          if (!existingIds.has(deviceId)) continue;
          upserts.push(
            this.upsertDeviceStatus(deviceId, {
              status: DeviceHealthStatus.ONLINE,
              ...payload,
            }),
          );
        }

        try {
          await Promise.all(upserts);
        } catch (e) {
          this.logger.error('Failed to upsert device statuses', e);
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

    const qb = this.devicesRepository
      .createQueryBuilder('device')
      .leftJoinAndSelect('device.owner', 'owner')
      .leftJoinAndSelect('device.deviceStatus', 'deviceStatus');

    if (nameFilter) {
      qb.andWhere('device.name ILIKE :nameFilter', { nameFilter: `%${nameFilter}%` });
    }
    if (status) {
      qb.andWhere('deviceStatus.status = :status', { status });
    }
    if (ownerId) {
      qb.andWhere('device.ownerId = :ownerId', { ownerId });
    }

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'status', 'batteryLevel'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderField =
      safeSortBy === 'status'
        ? 'deviceStatus.status'
        : safeSortBy === 'batteryLevel'
          ? 'deviceStatus.batteryLevel'
          : `device.${safeSortBy}`;

    const [data, total] = await qb
      .orderBy(orderField, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return [data, total];
  }

  /**
   * Returns a single device by ID.
   */
  async findOne(id: string): Promise<Device> {
    const device = await this.devicesRepository.findOne({
      where: { id },
      relations: ['owner', 'deviceStatus'],
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
