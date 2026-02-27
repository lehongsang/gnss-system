import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { LoggerService } from './logger/logger.service';

@Global()
@Module({
  imports: [],
  providers: [RedisService, LoggerService],
  exports: [RedisService, LoggerService],
})
export class ServicesModule {}
