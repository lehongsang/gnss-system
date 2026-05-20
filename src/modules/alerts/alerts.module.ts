import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './entities/alert.entity';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { MqttModule } from '@/services/mqtt/mqtt.module';
import { Device } from '@/modules/devices/entities/device.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, Device]),
    MqttModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
