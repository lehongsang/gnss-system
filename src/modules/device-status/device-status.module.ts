import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceStatusService } from './device-status.service';
import { DeviceStatusController } from './device-status.controller';
import { DeviceStatus } from './entities/device-status.entity';
import { DevicesModule } from '@/modules/devices/devices.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceStatus]), DevicesModule],
  controllers: [DeviceStatusController],
  providers: [DeviceStatusService],
  exports: [DeviceStatusService],
})
export class DeviceStatusModule {}
