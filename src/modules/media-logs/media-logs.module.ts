import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaLogsService } from './media-logs.service';
import { MediaLogsController } from './media-logs.controller';
import { MediaLogsConsumer } from './media-logs.consumer';
import { OpticalFlowResultConsumer } from './optical-flow-result.consumer';
import { MediaLog } from './entities/media-log.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { StorageModule } from '@/services/storage/storage.module';
import { AlertsModule } from '@/modules/alerts/alerts.module';
import { MqttModule } from '@/services/mqtt/mqtt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaLog]),
    DevicesModule,
    StorageModule,
    AlertsModule,
    MqttModule,
  ],
  controllers: [MediaLogsController],
  providers: [MediaLogsService, MediaLogsConsumer, OpticalFlowResultConsumer],
  exports: [MediaLogsService],
})
export class MediaLogsModule {}