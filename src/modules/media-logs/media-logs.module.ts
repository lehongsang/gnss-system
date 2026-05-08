import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaLogsService } from './media-logs.service';
import { MediaLogsController } from './media-logs.controller';
import { MediaLogsConsumer } from './media-logs.consumer';
import { MediaLog } from './entities/media-log.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { StorageModule } from '@/services/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaLog]),
    DevicesModule,
    StorageModule,
  ],
  controllers: [MediaLogsController],
  providers: [MediaLogsService, MediaLogsConsumer],
  exports: [MediaLogsService],
})
export class MediaLogsModule {}
