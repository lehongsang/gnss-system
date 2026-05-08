import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceGroupsService } from './device-groups.service';
import { DeviceGroupsController } from './device-groups.controller';
import { DeviceGroup } from './entities/device-group.entity';
import { Device } from '@/modules/devices/entities/device.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceGroup, Device])],
  controllers: [DeviceGroupsController],
  providers: [DeviceGroupsService],
  exports: [DeviceGroupsService],
})
export class DeviceGroupsModule {}
