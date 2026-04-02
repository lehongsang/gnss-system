import { BaseEntity } from '@/commons/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

@Entity('devices')
export class Device extends BaseEntity {
  @ApiProperty({ description: 'Name of the device' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ description: 'MAC address of the device', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  macAddress?: string | null;

  @ApiProperty({ enum: DeviceStatus, description: 'Status of the device', nullable: true })
  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.OFFLINE,
    nullable: true,
  })
  status?: DeviceStatus | null;

  @ApiProperty({ description: 'Battery level (0-100)', nullable: true })
  @Column({ type: 'integer', nullable: true })
  batteryLevel?: number | null;

  @ApiProperty({ description: 'Camera status', nullable: true })
  @Column({ type: 'boolean', nullable: true, default: false })
  cameraStatus?: boolean | null;

  @ApiProperty({ description: 'GNSS status', nullable: true })
  @Column({ type: 'boolean', nullable: true, default: false })
  gnssStatus?: boolean | null;

  @ApiProperty({ description: 'Owner user ID', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  ownerId?: string | null;

  @ApiProperty({ type: () => User, nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User | null;
}
