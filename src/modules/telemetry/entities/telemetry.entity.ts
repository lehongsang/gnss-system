import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { BaseEntity } from '@/commons/entities/base.entity';

export enum AccuracyStatus {
  GNSS_ONLY = 'gnss_only',
  VISION_ONLY = 'vision_only',
  FUSED = 'fused',
}

/**
 * Telemetry entity – high-frequency time-series data (5–10 Hz).
 * Stored in TimescaleDB (hypertable partitioned by `timestamp`).
 * `geom` column requires PostGIS extension.
 */
@Entity('telemetry')
export class Telemetry extends BaseEntity {

  @ApiProperty({ description: 'Device ID (FK)' })
  @Column({ type: 'uuid' })
  deviceId: string;

  @ApiProperty({ type: () => Device })
  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @ApiProperty({ description: 'Timestamp of the position fix' })
  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Latitude' })
  @Column({ type: 'float' })
  lat: number;

  @ApiProperty({ description: 'Longitude' })
  @Column({ type: 'float' })
  lng: number;

  @ApiProperty({ description: 'Altitude (metres)', nullable: true })
  @Column({ type: 'float', nullable: true })
  alt?: number | null;

  @ApiProperty({
    enum: AccuracyStatus,
    description: 'Fusion status: gnss_only | vision_only | fused',
    nullable: true,
  })
  @Column({
    type: 'enum',
    enum: AccuracyStatus,
    nullable: true,
  })
  accuracyStatus?: AccuracyStatus | null;

  /**
   * PostGIS Point geometry – populated by a DB trigger or in the service layer.
   * TypeORM stores it as a raw string; use ST_SetSRID(ST_MakePoint(lng, lat), 4326) in queries.
   */
  @ApiProperty({ description: 'PostGIS geometry(Point, 4326)', nullable: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  geom?: string | null;
}
