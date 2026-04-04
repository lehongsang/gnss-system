import { BaseEntity } from '@/commons/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { DeviceStatusEntity } from './device-status.entity';


@Entity('devices')
export class Device extends BaseEntity {
  @ApiProperty({ description: 'Name of the device' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ description: 'MAC address of the device', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  macAddress?: string | null;

  @ApiProperty({ description: 'Owner user ID', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  ownerId?: string | null;

  @ApiProperty({ type: () => User, nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User | null;

  @ApiProperty({ type: () => DeviceStatusEntity, nullable: true })
  @OneToOne(() => DeviceStatusEntity, (ds) => ds.device, { nullable: true })
  deviceStatus?: DeviceStatusEntity | null;
}
