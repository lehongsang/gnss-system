import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { TelemetryConsumer } from './telemetry.consumer';
import { TelemetryController } from './telemetry.controller';
import { Telemetry } from './entities/telemetry.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { KafkaModule } from '@/services/kafka/kafka.module';
import { GnssGatewayModule } from '@/gateways/gnss-gateway.module';
import { AlertsModule } from '@/modules/alerts/alerts.module';
import { GeofencesModule } from '@/modules/geofences/geofences.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Telemetry]),
    DevicesModule,
    KafkaModule,
    GnssGatewayModule,
    AlertsModule,
    GeofencesModule,
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryConsumer],
  exports: [TelemetryService],
})
export class TelemetryModule {}
