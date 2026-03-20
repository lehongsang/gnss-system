import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { getAuth } from './auth';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { MailService } from '@/services/mail/mail.service';
import { RedisService } from '@/services/redis/redis.service';

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [ConfigService, 'PG_POOL', MailService, RedisService],
      useFactory: (
        configService: ConfigService,
        pool: Pool,
        mailService: MailService,
        redisService: RedisService,
      ) => ({
        auth: getAuth(pool, configService, mailService, redisService),
      }),
    }),
  ],
})
export class AuthModule {}
