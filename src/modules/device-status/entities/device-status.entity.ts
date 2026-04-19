import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum DeviceStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

@Entity('device_status')
export class DeviceStatus {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid', name: 'device_id' })
  deviceId: string;

  @OneToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: DeviceStatusEnum, required: false })
  @Column({ type: 'enum', enum: DeviceStatusEnum, nullable: true })
  status: DeviceStatusEnum | null;

  @ApiProperty({ required: false })
  @Column({ type: 'integer', nullable: true, name: 'battery_level' })
  batteryLevel: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'boolean', nullable: true, name: 'camera_status' })
  cameraStatus: boolean | null;

  @ApiProperty({ required: false })
  @Column({ type: 'boolean', nullable: true, name: 'gnss_status' })
  gnssStatus: boolean | null;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
