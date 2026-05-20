import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeofencesService } from './geofences.service';
import { GeofencesController } from './geofences.controller';
import { Geofence } from './entities/geofence.entity';
import { GeofenceDeviceState } from './entities/geofence-device-state.entity';
import { DevicesModule } from '@/modules/devices/devices.module';

@Module({
  imports: [TypeOrmModule.forFeature([Geofence, GeofenceDeviceState]), DevicesModule],
  controllers: [GeofencesController],
  providers: [GeofencesService],
  exports: [GeofencesService],
})
export class GeofencesModule {}
