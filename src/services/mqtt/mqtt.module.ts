import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
