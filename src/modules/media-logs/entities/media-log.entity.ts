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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType } from '@/commons/enums/app.enum';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export { MediaType };

@Entity('media_logs')
@Index(['deviceId', 'startTime'])
export class MediaLog extends BaseEntity {
  @ApiProperty({ description: 'Device UUID that produced this media record' })
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ManyToOne(() => Device, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ description: 'Start timestamp of the recording' })
  @Column({ type: 'timestamp', name: 'start_time', nullable: false })
  @IsNotEmpty()
  @IsDateString()
  startTime: Date;

  @ApiProperty({ description: 'End timestamp of the recording' })
  @Column({ type: 'timestamp', name: 'end_time', nullable: false })
  @IsNotEmpty()
  @IsDateString()
  endTime: Date;

  @ApiProperty({ enum: MediaType, description: 'Type of media (video chunk or image frame)' })
  @Column({ type: 'enum', enum: MediaType, name: 'media_type', nullable: false })
  @IsNotEmpty()
  @IsEnum(MediaType)
  mediaType: MediaType;

  @ApiProperty({ description: 'S3 object key used to generate presigned URLs' })
  @Column({ type: 'varchar', nullable: false, name: 's3_key' })
  @IsNotEmpty()
  @IsString()
  s3Key: string;

  @ApiPropertyOptional({ description: 'Static file URL (legacy, prefer s3Key + presigned URL)' })
  @Column({ type: 'varchar', nullable: true, name: 'file_url' })
  @IsOptional()
  @IsString()
  fileUrl: string | null;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
