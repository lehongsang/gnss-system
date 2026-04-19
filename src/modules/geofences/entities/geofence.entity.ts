import { Entity, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('geofences')
export class Geofence extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', nullable: false })
  name: string;

  // geom column will be added via SQL extension: ALTER TABLE geofences ADD COLUMN geom geometry(Polygon, 4326) NOT NULL;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToMany(() => Device)
  @JoinTable({
    name: 'device_geofence',
    joinColumn: { name: 'geofence_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'device_id', referencedColumnName: 'id' },
  })
  devices: Device[];
}
