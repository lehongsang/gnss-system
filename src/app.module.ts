import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CombineModule } from './modules/combine.module';
import { ServicesModule } from './services/services.module';
import { GnssGatewayModule } from './gateways/gnss-gateway.module';
import databaseConfig from './database/database.config';
import { LoggerModule } from './commons/logger/logger.module';
import { CustomRateLimitGuard } from './commons/guards/rate-limit.guard';
import {
  AllExceptionsFilter,
  BetterAuthErrorExceptionFilter,
  HttpExceptionFilter,
  CustomExceptionFilter,
} from './commons/filters';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      load: [databaseConfig],
    }),
    LoggerModule,
    DatabaseModule,
    ServicesModule,
    CombineModule,
    GnssGatewayModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomRateLimitGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter, // Catch-all fallback — registered FIRST, runs LAST
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: BetterAuthErrorExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: CustomExceptionFilter, // Most specific — registered LAST, runs FIRST
    },
  ],
})
export class AppModule {}
