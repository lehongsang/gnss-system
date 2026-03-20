import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { MailService } from './mail/mail.service';
import { KafkaModule } from './kafka/kafka.module';
import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';



@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT'),
          secure: config.get<string>('MAIL_SECURE') === 'true',
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'),
          },
          family: 4,
          tls: {
            rejectUnauthorized: false,
          },
        },
        defaults: {
          from: config.get<string>('MAIL_FROM'),
        },
        template: {
          dir: join(__dirname, 'mail/templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
    KafkaModule,
    StorageModule,
    SearchModule,
  ],
  providers: [RedisService, MailService],
  exports: [
    RedisService,
    MailService,
    KafkaModule,
    StorageModule,
    SearchModule,
  ],
})
export class ServicesModule {}


