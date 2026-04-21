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
import { DeviceStatusEnum } from '@/commons/enums/app.enum';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export { DeviceStatusEnum };

/**
 * DeviceStatus is a 1-to-1 extension of Device.
 * It intentionally uses deviceId as a natural primary key instead of extending
 * BaseEntity, because this record is always addressed by its device relationship
 * and there is exactly one status row per device (upsert pattern).
 */
@Entity('device_status')
export class DeviceStatus {
  @ApiProperty({ description: 'Device UUID (serves as PK)' })
  @PrimaryColumn({ type: 'uuid', name: 'device_id' })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @OneToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: DeviceStatusEnum, description: 'Operational status' })
  @Column({ type: 'enum', enum: DeviceStatusEnum, nullable: false })
  @IsNotEmpty()
  @IsEnum(DeviceStatusEnum)
  status: DeviceStatusEnum;

  @ApiProperty({ description: 'Battery level as a percentage (0–100)' })
  @Column({ type: 'integer', nullable: false, name: 'battery_level' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel: number;

  @ApiProperty({ description: 'Whether the on-board camera is operational' })
  @Column({ type: 'boolean', nullable: false, name: 'camera_status' })
  @IsNotEmpty()
  @IsBoolean()
  cameraStatus: boolean;

  @ApiProperty({ description: 'Whether the GNSS receiver is operational' })
  @Column({ type: 'boolean', nullable: false, name: 'gnss_status' })
  @IsNotEmpty()
  @IsBoolean()
  gnssStatus: boolean;

  @ApiProperty({ description: 'Timestamp of the last status update' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
