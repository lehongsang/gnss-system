import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsConsumer } from './alerts.consumer';
import { AlertsController } from './alerts.controller';
import { Alert } from './entities/alert.entity';
import { MediaLog } from '@/modules/media-logs/entities/media-log.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { KafkaModule } from '@/services/kafka/kafka.module';
import { GnssGatewayModule } from '@/gateways/gnss-gateway.module';
import { TelemetryModule } from '@/modules/telemetry/telemetry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, MediaLog]),
    DevicesModule,
    KafkaModule,
    GnssGatewayModule,
    forwardRef(() => TelemetryModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsConsumer],
  exports: [AlertsService],
})
export class AlertsModule {}
