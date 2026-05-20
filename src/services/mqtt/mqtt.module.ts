import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '../redis/redis.module';
import { MediaServerModule } from '../media-server/media-server.module';

@Module({
  imports: [KafkaModule, RedisModule, MediaServerModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
