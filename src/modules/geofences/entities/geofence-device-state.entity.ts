import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { Device } from '@/modules/devices/entities/device.entity';
import { Geofence } from './geofence.entity';

export enum GeofencePresenceState {
  INSIDE = 'inside',
  OUTSIDE = 'outside',
}

@Entity('geofence_device_states')
export class GeofenceDeviceState {
  @ApiProperty({ description: 'Device UUID' })
  @PrimaryColumn({ type: 'uuid', name: 'device_id' })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ description: 'Geofence UUID' })
  @PrimaryColumn({ type: 'uuid', name: 'geofence_id' })
  @IsNotEmpty()
  @IsUUID('7')
  geofenceId: string;

  @ManyToOne(() => Geofence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'geofence_id' })
  geofence: Geofence;

  @ApiProperty({ enum: GeofencePresenceState })
  @Column({
    type: 'enum',
    enum: GeofencePresenceState,
    nullable: false,
  })
  @IsEnum(GeofencePresenceState)
  state: GeofencePresenceState;

  @ApiProperty({ description: 'Timestamp of the last geofence state change/check' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
