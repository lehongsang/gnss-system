import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { GeofencesModule } from './geofences/geofences.module';
import { AlertsModule } from './alerts/alerts.module';
import { MediaLogsModule } from './media-logs/media-logs.module';

@Module({
  imports: [
    AuthModule,
    RootModule,
    DevicesModule,
    UsersModule,
    TelemetryModule,
    GeofencesModule,
    AlertsModule,
    MediaLogsModule,
  ],
})
export class CombineModule {}

