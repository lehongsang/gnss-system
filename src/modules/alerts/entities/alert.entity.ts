import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { MediaLog } from '@/modules/media-logs/entities/media-log.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType } from '@/commons/enums/app.enum';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export { AlertType };

@Entity('alerts')
@Index(['deviceId', 'createdAt'])
@Index(['deviceId', 'snapshotId'])
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

  @ApiPropertyOptional({ description: 'URL to a snapshot taken at the time of alert' })
  @Column({ type: 'varchar', nullable: true, name: 'snapshot_url' })
  @IsOptional()
  @IsUrl()
  snapshotUrl: string | null;

  @ApiPropertyOptional({ description: 'Correlation ID shared with the snapshot media payload' })
  @Column({ type: 'varchar', nullable: true, name: 'snapshot_id', length: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  snapshotId: string | null;

  @ApiPropertyOptional({ description: 'Linked media log UUID for the alert snapshot' })
  @Column({ type: 'uuid', nullable: true, name: 'snapshot_media_log_id' })
  @IsOptional()
  @IsUUID('7')
  snapshotMediaLogId: string | null;

  @ManyToOne(() => MediaLog, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'snapshot_media_log_id' })
  snapshotMediaLog: MediaLog | null;

  @ApiProperty({ description: 'Whether the alert has been acknowledged / resolved' })
  @Column({ type: 'boolean', default: false, name: 'is_resolved' })
  @IsNotEmpty()
  @IsBoolean()
  isResolved: boolean;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
