import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { DeviceStatusEntity } from './entities/device-status.entity';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { StorageModule } from '@/services/storage/storage.module';
import { MediaLogsModule } from '@/modules/media-logs/media-logs.module';
import { MqttModule } from '@/services/mqtt/mqtt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, DeviceStatusEntity]),
    StorageModule,
    MediaLogsModule,
    MqttModule,
  ],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
