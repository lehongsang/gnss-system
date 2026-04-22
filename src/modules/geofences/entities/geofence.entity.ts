import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

@Entity('geofences')
export class Geofence extends BaseEntity {
  @ApiProperty({ description: 'Human-readable geofence name' })
  @Column({ type: 'varchar', nullable: false })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'UUID of the user who created this geofence' })
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  @IsOptional()
  @IsUUID('7')
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  /**
   * PostGIS geometry column storing the geofence polygon boundary.
   *
   * TypeORM does not natively support PostGIS geometry types, so this column
   * is declared as 'geometry' with explicit `spatialFeatureType` and `srid`.
   * TypeORM `synchronize` will create this column as `geometry(Geometry,4326)`.
   *
   * All reads/writes use raw SQL with ST_GeomFromGeoJSON / ST_AsGeoJSON
   * because TypeORM cannot serialize/deserialize PostGIS geometries automatically.
   */
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
    select: false, // Excluded from default SELECT; use ST_AsGeoJSON() in raw queries
  })
  geom: string;

  @ManyToMany(() => Device)
  @JoinTable({
    name: 'device_geofence',
    joinColumn: { name: 'geofence_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'device_id', referencedColumnName: 'id' },
  })
  devices: Device[];

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
