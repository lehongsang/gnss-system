import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToOne, PrimaryColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Device } from './device.entity';
import { DeviceStatus as DeviceHealthStatus } from '@/commons/enums/app.enum';

@Entity('device_status')
export class DeviceStatusEntity {
  @ApiProperty({ description: 'Device ID (PK, FK → devices.id)' })
  @PrimaryColumn({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @ApiProperty({ type: () => Device })
  @OneToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: DeviceHealthStatus, description: 'online | offline | maintenance' })
  @Column({
    name: 'status',
    type: 'enum',
    enum: DeviceHealthStatus,
  })
  status: DeviceHealthStatus;

  @ApiProperty({ description: 'Battery level (0-100)', required: false, nullable: true })
  @Column({ name: 'battery_level', type: 'integer', nullable: true })
  batteryLevel?: number | null;

  @ApiProperty({ description: 'Camera status', required: false, nullable: true })
  @Column({ name: 'camera_status', type: 'boolean', nullable: true })
  cameraStatus?: boolean | null;

  @ApiProperty({ description: 'GNSS status', required: false, nullable: true })
  @Column({ name: 'gnss_status', type: 'boolean', nullable: true })
  gnssStatus?: boolean | null;

  @ApiProperty({ description: 'Last update timestamp' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

