import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { BaseEntity } from '@/commons/entities/base.entity';

export enum AlertType {
  TRAJECTORY_DEVIATION = 'trajectory_deviation',
  DANGEROUS_OBSTACLE = 'dangerous_obstacle',
  SIGNAL_LOST = 'signal_lost',
  GEOFENCE_BREACH = 'geofence_breach',
}

@Entity('alerts')
export class Alert extends BaseEntity {

  @ApiProperty({ description: 'Device ID (FK)' })
  @Column({ type: 'uuid', nullable: true })
  deviceId?: string | null;

  @ApiProperty({ type: () => Device, nullable: true })
  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deviceId' })
  device?: Device | null;

  @ApiProperty({ enum: AlertType, description: 'Type of alert', nullable: true })
  @Column({ type: 'enum', enum: AlertType, nullable: true })
  alertType?: AlertType | null;

  @ApiProperty({ description: 'Alert message detail', nullable: true })
  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @ApiProperty({ description: 'Timestamp when alert occurred' })
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @ApiProperty({ description: 'Latitude at the time of alert', nullable: true })
  @Column({ type: 'float', nullable: true })
  lat?: number | null;

  @ApiProperty({ description: 'Longitude at the time of alert', nullable: true })
  @Column({ type: 'float', nullable: true })
  lng?: number | null;

  @ApiProperty({ description: 'URL to image/video snapshot in Object Storage', nullable: true })
  @Column({ type: 'varchar', nullable: true })
  snapshotUrl?: string | null;

  @ApiProperty({ description: 'Whether the alert has been resolved' })
  @Column({ type: 'boolean', default: false })
  isResolved: boolean;
}
