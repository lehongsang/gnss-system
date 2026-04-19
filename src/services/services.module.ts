import { Global, Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { KafkaModule } from './kafka/kafka.module';
import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';
import { MqttModule } from './mqtt/mqtt.module';

@Global()
@Module({
  imports: [RedisModule, MailModule, KafkaModule, StorageModule, SearchModule, MqttModule],
  exports: [RedisModule, MailModule, KafkaModule, StorageModule, SearchModule, MqttModule],
})
export class ServicesModule {}
