import { Module } from '@nestjs/common';
import { DevicesModule } from '@/modules/devices/devices.module';
import { ServicesModule } from '@/services/services.module';
import { LiveStreamsController } from './live-streams.controller';
import { LiveStreamsService } from './live-streams.service';

@Module({
  imports: [DevicesModule, ServicesModule],
  controllers: [LiveStreamsController],
  providers: [LiveStreamsService],
})
export class LiveStreamsModule {}
