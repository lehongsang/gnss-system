import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../redis/redis.module';
import { MediaServerModule } from '../media-server/media-server.module';
import { DevicesModule } from '@/modules/devices/devices.module';
import { MqttAuthController } from './mqtt-auth.controller';

@Module({
  imports: [KafkaModule, RedisModule, MediaServerModule, DevicesModule],
  controllers: [MqttAuthController],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
