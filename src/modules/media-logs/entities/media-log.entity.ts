import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { Media } from '@/services/storage/entities/media.entity';

export enum MediaLogType {
  VIDEO_CHUNK = 'video_chunk',
  IMAGE_FRAME = 'image_frame',
}

/**
 * MediaLog extends the base Media entity with device-specific time-range metadata
 * for video/image playback synchronized with telemetry on the map.
 */
@Entity('media_logs')
export class MediaLog extends Media {
  @ApiProperty({ description: 'Device ID this media belongs to', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  deviceId?: string | null;

  @ApiProperty({ description: 'Recording start time (synced with telemetry)', nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  startTime?: Date | null;

  @ApiProperty({ description: 'Recording end time', nullable: true })
  @Column({ type: 'timestamp', nullable: true })
  endTime?: Date | null;

  @ApiProperty({ enum: MediaLogType, description: 'Media type: video_chunk or image_frame', nullable: true })
  @Column({ type: 'enum', enum: MediaLogType, nullable: true })
  mediaType?: MediaLogType | null;
}
