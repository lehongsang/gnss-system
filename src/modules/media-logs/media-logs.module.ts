import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaLog } from './entities/media-log.entity';
import { MediaLogsController } from './media-logs.controller';
import { MediaLogsService } from './media-logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaLog])],
  controllers: [MediaLogsController],
  providers: [MediaLogsService],
  exports: [MediaLogsService],
})
export class MediaLogsModule {}
