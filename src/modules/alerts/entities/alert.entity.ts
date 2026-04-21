import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType } from '@/commons/enums/app.enum';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export { AlertType };

@Entity('alerts')
@Index(['deviceId', 'createdAt'])
export class Alert extends BaseEntity {
  @ApiProperty({ description: 'Device UUID that triggered the alert' })
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ManyToOne(() => Device, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: AlertType, description: 'Category of the alert' })
  @Column({
    type: 'enum',
    enum: AlertType,
    name: 'alert_type',
    nullable: false,
  })
  @IsNotEmpty()
  @IsEnum(AlertType)
  alertType: AlertType;

  @ApiProperty({ description: 'Human-readable alert description' })
  @Column({ type: 'text', nullable: false })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiProperty({ description: 'Latitude where the alert occurred' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsLatitude()
  lat: number;

  @ApiProperty({ description: 'Longitude where the alert occurred' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsLongitude()
  lng: number;

  @ApiProperty({ description: 'URL to a snapshot taken at the time of alert' })
  @Column({ type: 'varchar', nullable: false, name: 'snapshot_url' })
  @IsNotEmpty()
  @IsUrl()
  snapshotUrl: string;

  @ApiProperty({ description: 'Whether the alert has been acknowledged / resolved' })
  @Column({ type: 'boolean', default: false, name: 'is_resolved' })
  @IsNotEmpty()
  @IsBoolean()
  isResolved: boolean;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
