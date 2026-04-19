import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum MediaType {
  VIDEO_CHUNK = 'video_chunk',
  IMAGE_FRAME = 'image_frame',
}

@Entity('media_logs')
@Index(['deviceId', 'startTime'])
export class MediaLog extends BaseEntity {
  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'device_id', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamp', name: 'start_time', nullable: true })
  startTime: Date | null;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamp', name: 'end_time', nullable: true })
  endTime: Date | null;

  @ApiProperty({ enum: MediaType, required: false })
  @Column({ type: 'enum', enum: MediaType, name: 'media_type', nullable: true })
  mediaType: MediaType | null;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: false, name: 'file_url' })
  fileUrl: string;
}
