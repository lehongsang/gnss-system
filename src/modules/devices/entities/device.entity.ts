import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { DeviceGroup } from '@/modules/device-groups/entities/device-group.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

@Entity('devices')
export class Device extends BaseEntity {
  @ApiProperty({ description: 'Human-readable device name' })
  @Column({ type: 'varchar', nullable: false })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'MQTT username assigned to this device' })
  @Column({
    type: 'varchar',
    unique: true,
    nullable: true,
    name: 'mqtt_username',
  })
  @IsOptional()
  @IsString()
  mqttUsername: string | null;

  @Exclude()
  @Column({
    type: 'varchar',
    nullable: true,
    name: 'mqtt_password_hash',
    select: false,
  })
  mqttPasswordHash: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp when MQTT credentials were issued',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'mqtt_credentials_issued_at',
  })
  mqttCredentialsIssuedAt: Date | null;

  @ApiPropertyOptional({ description: 'UUID of the user who owns this device' })
  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  @IsOptional()
  @IsUUID('7')
  ownerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiPropertyOptional({
    example: 80,
    description: 'Ngưỡng tốc độ tối đa (km/h). null = không giám sát tốc độ.',
  })
  @Column({ type: 'float', nullable: true, name: 'speed_limit_kmh' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  speedLimitKmh: number | null;

  @ApiPropertyOptional({ description: 'UUID of the device group' })
  @Column({ type: 'uuid', name: 'device_group_id', nullable: true })
  @IsOptional()
  @IsString()
  deviceGroupId: string | null;

  @ManyToOne(() => DeviceGroup, (group) => group.devices, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'device_group_id' })
  group: DeviceGroup;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
