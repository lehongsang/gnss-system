import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DeviceStatus } from './entities/device-status.entity';
import { UpdateDeviceStatusDto } from './dtos/update-device-status.dto';
import { DevicesService } from '@/modules/devices/devices.service';
import { DeviceStatusEnum } from '@/commons/enums/app.enum';

@Injectable()
export class DeviceStatusService {
  constructor(
    @InjectRepository(DeviceStatus)
    private readonly deviceStatusRepository: Repository<DeviceStatus>,
    private readonly devicesService: DevicesService,
    private readonly dataSource: DataSource,
  ) {}


  /**
   * Retrieves the current status record for a device.
   * If no status exists yet (first query), creates and persists a default
   * record so the client always receives a valid entity with an ID.
   */
  async findByDevice(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DeviceStatus> {
    // Step 1: Verify device exists and requester has ownership
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);

    // Step 2: Look up existing status
    let status = await this.deviceStatusRepository.findOneBy({ deviceId });

    // Step 3: If no status exists, create and persist a default record
    if (!status) {
      status = this.deviceStatusRepository.create({
        deviceId,
        status: DeviceStatusEnum.OFFLINE,
        batteryLevel: 0,
        cameraStatus: false,
        gnssStatus: false,
      });
      status = await this.deviceStatusRepository.save(status);
    }

    return status;
  }

  /**
   * Returns all device-status records.
   * Used by admin pages that need to display status for every device at once.
   */
  async findAll(): Promise<DeviceStatus[]> {
    return this.deviceStatusRepository.find();
  }

  /**
   * Returns status rows for every device owned by the requester.
   * Devices without a heartbeat record are represented as offline defaults.
   */
  async findMine(ownerId: string): Promise<DeviceStatus[]> {
    return this.dataSource.query<DeviceStatus[]>(
      `
      SELECT
        d.id AS "deviceId",
        COALESCE(ds.status, 'offline') AS status,
        COALESCE(ds.battery_level, 0) AS "batteryLevel",
        COALESCE(ds.camera_status, false) AS "cameraStatus",
        COALESCE(ds.gnss_status, false) AS "gnssStatus",
        ds.updated_at AS "updatedAt"
      FROM devices d
      LEFT JOIN device_status ds ON ds.device_id = d.id
      WHERE d.owner_id = $1
        AND d.deleted_at IS NULL
      ORDER BY d."createdAt" DESC
      `,
      [ownerId],
    );
  }

  async upsert(
    deviceId: string,
    dto: UpdateDeviceStatusDto,
  ): Promise<DeviceStatus> {
    let status = await this.deviceStatusRepository.findOneBy({ deviceId });
    if (!status) {
      status = this.deviceStatusRepository.create({ deviceId, ...dto });
    } else {
      Object.assign(status, dto);
    }
    return this.deviceStatusRepository.save(status);
  }
}
