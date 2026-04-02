import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { BaseEntity } from '@/commons/entities/base.entity';

/**
 * Geofence entity – stores a named PostGIS Polygon that defines a safe zone.
 */
@Entity('geofences')
export class Geofence extends BaseEntity {

  @ApiProperty({ description: 'Name of the geofence zone' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  /**
   * PostGIS Polygon geometry – SRID 4326.
   * Receives a GeoJSON Polygon via the service and is cast to geometry.
   */
  @ApiProperty({ description: 'PostGIS geometry(Polygon, 4326)' })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  geom: string;

  @ApiProperty({ description: 'ID of the user who created this geofence', nullable: true })
  @Column({ type: 'uuid', nullable: true })
  createdBy?: string | null;

  @ApiProperty({ type: () => User, nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator?: User | null;

}
