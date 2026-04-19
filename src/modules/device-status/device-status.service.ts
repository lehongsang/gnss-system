import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceStatus } from './entities/device-status.entity';
import { UpdateDeviceStatusDto } from './dtos/update-device-status.dto';
import { DevicesService } from '@/modules/devices/devices.service';

@Injectable()
export class DeviceStatusService implements OnModuleInit {
  constructor(
    @InjectRepository(DeviceStatus)
    private readonly deviceStatusRepository: Repository<DeviceStatus>,
    private readonly devicesService: DevicesService,
  ) {}

  onModuleInit() {
    // TODO: Subscribe to 'gnss.device.status' Kafka topic
  }

  async findByDevice(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DeviceStatus> {
    // Check ownership first
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);

    let status = await this.deviceStatusRepository.findOneBy({ deviceId });
    if (!status) {
      status = this.deviceStatusRepository.create({ deviceId }); // default state
    }
    return status;
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
