import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsConsumer } from './alerts.consumer';
import { AlertsController } from './alerts.controller';
import { Alert } from './entities/alert.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { KafkaModule } from '@/services/kafka/kafka.module';
import { GnssGatewayModule } from '@/gateways/gnss-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), DevicesModule, KafkaModule, GnssGatewayModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsConsumer],
  exports: [AlertsService],
})
export class AlertsModule {}
