import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceStatusService } from './device-status.service';
import { DeviceStatusConsumer } from './device-status.consumer';
import { DeviceStatusController } from './device-status.controller';
import { DeviceStatus } from './entities/device-status.entity';
import { DevicesModule } from '@/modules/devices/devices.module';
import { KafkaModule } from '@/services/kafka/kafka.module';
import { GnssGatewayModule } from '@/gateways/gnss-gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceStatus]), DevicesModule, KafkaModule, GnssGatewayModule],
  controllers: [DeviceStatusController],
  providers: [DeviceStatusService, DeviceStatusConsumer],
  exports: [DeviceStatusService],
})
export class DeviceStatusModule {}
