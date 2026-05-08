import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

@Entity('device_groups')
export class DeviceGroup extends BaseEntity {
  @ApiProperty({ description: 'Tên nhóm thiết bị' })
  @Column({ type: 'varchar', nullable: false })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết nhóm thiết bị' })
  @Column({ type: 'varchar', nullable: true })
  @IsOptional()
  @IsString()
  description: string | null;

  @Column({ type: 'uuid', name: 'owner_id', nullable: false })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => Device, (device) => device.group)
  devices: Device[];
}
