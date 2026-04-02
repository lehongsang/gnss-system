import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { Geofence } from './geofence.entity';
import { BaseEntity } from '@/commons/entities/base.entity';

/**
 * Join table – many-to-many between Device and Geofence.
 * Composite PK: (deviceId, geofenceId).
 */
@Entity('device_geofence')
export class DeviceGeofence extends BaseEntity {
  @ApiProperty({ description: 'Device ID' })
  @Column({ type: 'uuid' })
  deviceId: string;

  @ApiProperty({ description: 'Geofence ID' })
  @Column({ type: 'uuid' })
  geofenceId: string;

  @ApiProperty({ type: () => Device })
  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @ApiProperty({ type: () => Geofence })
  @ManyToOne(() => Geofence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'geofenceId' })
  geofence: Geofence;
}
