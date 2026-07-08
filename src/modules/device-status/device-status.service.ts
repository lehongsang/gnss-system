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
   * Lấy bản ghi trạng thái hiện tại của thiết bị.
   * Nếu chưa có trạng thái nào (lần đầu query), tạo và lưu một bản ghi mặc định
   * để client luôn nhận được entity hợp lệ có ID.
   */
  async findByDevice(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DeviceStatus> {
    // Bước 1: Kiểm tra thiết bị tồn tại và requester có quyền sở hữu
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);

    // Bước 2: Tìm trạng thái hiện có (kèm relation device để lấy metadata)
    let status = await this.deviceStatusRepository.findOne({
      where: { deviceId },
      relations: ['device'],
    });

    // Bước 3: Nếu chưa có trạng thái nào thì tạo và lưu bản ghi mặc định
    if (!status) {
      status = this.deviceStatusRepository.create({
        deviceId,
        status: DeviceStatusEnum.OFFLINE,
        batteryLevel: 0,
        cameraStatus: false,
        gnssStatus: false,
        satellitesTracked: 0,
        signalStrength: 0,
      });
      status = await this.deviceStatusRepository.save(status);
      status = await this.deviceStatusRepository.findOne({
        where: { deviceId },
        relations: ['device'],
      });
    }

    return status!;
  }

  /**
   * Trả về toàn bộ bản ghi trạng thái thiết bị.
   * Dùng cho trang admin cần hiển thị trạng thái của tất cả thiết bị cùng lúc.
   */
  async findAll(): Promise<DeviceStatus[]> {
    return this.deviceStatusRepository.find({ relations: ['device'] });
  }

  /**
   * Trả về trạng thái của tất cả thiết bị mà requester sở hữu.
   * Thiết bị chưa có bản ghi heartbeat nào sẽ mặc định coi là offline.
   */
  async findMine(ownerId: string): Promise<DeviceStatus[]> {
    return this.dataSource.query<DeviceStatus[]>(
      `
      SELECT
        d.id AS "deviceId",
        d.name AS "deviceName",
        COALESCE(ds.status, 'offline') AS status,
        COALESCE(ds.battery_level, 0) AS "batteryLevel",
        COALESCE(ds.camera_status, false) AS "cameraStatus",
        COALESCE(ds.gnss_status, false) AS "gnssStatus",
        COALESCE(ds.satellites_tracked, 0) AS "satellitesTracked",
        COALESCE(ds.signal_strength, 0) AS "signalStrength",
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
