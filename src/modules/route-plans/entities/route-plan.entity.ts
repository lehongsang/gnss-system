import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/commons/entities/base.entity';
import { RoutePlanStatus } from '@/commons/enums/app.enum';
import { Device } from '@/modules/devices/entities/device.entity';
import { User } from '@/modules/auth/entities/user.entity';

@Entity('route_plans')
@Index(['deviceId', 'status'])
export class RoutePlan extends BaseEntity {
  @ApiProperty({ description: 'Device UUID assigned to this route' })
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  deviceId: string;

  @ManyToOne(() => Device, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiPropertyOptional({ description: 'Owner UUID copied from the device' })
  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @ApiPropertyOptional({ description: 'Human-readable route name' })
  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @ApiProperty({ enum: RoutePlanStatus })
  @Column({
    type: 'enum',
    enum: RoutePlanStatus,
    default: RoutePlanStatus.PLANNED,
  })
  status: RoutePlanStatus;

  @ApiProperty({ example: 'mapbox' })
  @Column({ type: 'varchar', default: 'mapbox' })
  provider: string;

  @ApiProperty({ example: 'mapbox/driving' })
  @Column({ type: 'varchar', default: 'mapbox/driving' })
  profile: string;

  @ApiProperty({ example: 10.7769 })
  @Column({ type: 'float', name: 'origin_lat', nullable: false })
  originLat: number;

  @ApiProperty({ example: 106.6958 })
  @Column({ type: 'float', name: 'origin_lng', nullable: false })
  originLng: number;

  @ApiProperty({ example: 10.8012 })
  @Column({ type: 'float', name: 'destination_lat', nullable: false })
  destinationLat: number;

  @ApiProperty({ example: 106.7148 })
  @Column({ type: 'float', name: 'destination_lng', nullable: false })
  destinationLng: number;

  @ApiPropertyOptional({ example: 12500 })
  @Column({ type: 'float', nullable: true, name: 'distance_meters' })
  distanceMeters: number | null;

  @ApiPropertyOptional({ example: 1800 })
  @Column({ type: 'integer', nullable: true, name: 'duration_seconds' })
  durationSeconds: number | null;

  @ApiPropertyOptional({ description: 'Encoded polyline if provider returns one' })
  @Column({ type: 'text', nullable: true, name: 'encoded_polyline' })
  encodedPolyline: string | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'LineString',
    srid: 4326,
    nullable: true,
    select: false,
  })
  geom: string | null;

  @ApiProperty({ example: 50 })
  @Column({
    type: 'integer',
    default: 50,
    name: 'deviation_threshold_meters',
  })
  deviationThresholdMeters: number;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true, name: 'activated_at' })
  activatedAt: Date | null;

  @ApiPropertyOptional()
  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt: Date | null;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
