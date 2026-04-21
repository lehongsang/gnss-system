import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

@Entity('devices')
export class Device extends BaseEntity {
  @ApiProperty({ description: 'Human-readable device name' })
  @Column({ type: 'varchar', nullable: false })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'MAC address in IEEE format (AA:BB:CC:DD:EE:FF)' })
  @Column({
    type: 'varchar',
    unique: true,
    nullable: true,
    name: 'mac_address',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, {
    message: 'Invalid MAC address format',
  })
  macAddress: string | null;

  @ApiPropertyOptional({ description: 'UUID of the user who owns this device' })
  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  @IsOptional()
  @IsUUID('7')
  ownerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
