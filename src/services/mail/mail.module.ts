import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailConsumer } from './mail.consumer';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  providers: [MailService, MailConsumer],
  exports: [MailService],
})
export class MailModule {}
