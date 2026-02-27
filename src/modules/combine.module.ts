import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { getAuth } from './auth/auth';
import { UsersModule } from './users/users.module';
import { RootModule } from './root/root.module';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Module({
  imports: [
    AuthModule.forRootAsync({
      inject: [ConfigService, 'PG_POOL'],
      useFactory: (configService: ConfigService, pool: Pool) => ({
        auth: getAuth(pool, configService),
      }),
    }),
    UsersModule,
    RootModule,
  ],
})
export class CombineModule {}
