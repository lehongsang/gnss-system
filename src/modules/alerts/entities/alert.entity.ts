import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum AlertType {
  TRAJECTORY_DEVIATION = 'trajectory_deviation',
  DANGEROUS_OBSTACLE = 'dangerous_obstacle',
  SIGNAL_LOST = 'signal_lost',
  GEOFENCE_EXIT = 'geofence_exit',
  SPEEDING = 'speeding',
}

@Entity('alerts')
@Index(['deviceId', 'createdAt'])
export class Alert extends BaseEntity {
  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'device_id', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: AlertType })
  @Column({
    type: 'enum',
    enum: AlertType,
    name: 'alert_type',
    nullable: false,
  })
  alertType: AlertType;

  @ApiProperty({ required: false })
  @Column({ type: 'text', nullable: true })
  message: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true, name: 'snapshot_url' })
  snapshotUrl: string | null;

  @ApiProperty()
  @Column({ type: 'boolean', default: false, name: 'is_resolved' })
  isResolved: boolean;
}
