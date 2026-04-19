import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { Telemetry } from './entities/telemetry.entity';
import { DevicesModule } from '@/modules/devices/devices.module';

@Module({
  imports: [TypeOrmModule.forFeature([Telemetry]), DevicesModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
