import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CombineModule } from './modules/combine.module';
import { ServicesModule } from './services/services.module';
import databaseConfig from './database/database.config';
import { LoggerModule } from './commons/logger/logger.module';

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
  ],
})
export class AppModule {}
