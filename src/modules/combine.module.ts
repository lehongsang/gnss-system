import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [AuthModule, RootModule, UsersModule],
})
export class CombineModule {}
