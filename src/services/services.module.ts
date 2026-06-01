import { Global, Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { KafkaModule } from './kafka/kafka.module';
import { StorageModule } from './storage/storage.module';
import { MqttModule } from './mqtt/mqtt.module';
import { MediaServerModule } from './media-server/media-server.module';

@Global()
@Module({
  imports: [
    RedisModule,
    MailModule,
    KafkaModule,
    StorageModule,
    MqttModule,
    MediaServerModule,
  ],
  exports: [
    RedisModule,
    MailModule,
    KafkaModule,
    StorageModule,
    MqttModule,
    MediaServerModule,
  ],
})
export class ServicesModule {}
