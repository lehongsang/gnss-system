import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { BaseEntity } from '@/commons/entities/base.entity';
import { IsNotEmpty, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LocationDto } from '@/commons/dtos/location.dto';
import { Location } from '@/commons/interfaces/app.interface';
import { PointTransformer } from '@/utils/point-transformer';
import { AccuracyStatus } from '@/commons/enums/app.enum';



/**
 * Telemetry entity – high-frequency time-series data (5–10 Hz).
 * Stored in TimescaleDB (hypertable partitioned by `timestamp`).
 * `geom` column requires PostGIS extension.
 */
@Entity('telemetry')
export class Telemetry extends BaseEntity {

  @ApiProperty({ description: 'Device ID (FK)' })
  @IsUUID()
  @IsNotEmpty()
  @Column({ type: 'uuid' })
  deviceId: string;

  @ApiProperty({ type: () => Device })
  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @ApiProperty({ description: 'Timestamp of the position fix' })
  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;

  
  @ApiProperty({
    type: () => LocationDto,
    description: 'Geographic location (PostGIS point)',
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  @Column({
    type: 'point',
    nullable: true,
    transformer: PointTransformer,
  })
  location?: Location;

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
