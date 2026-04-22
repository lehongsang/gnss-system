import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccuracyStatus } from '@/commons/enums/app.enum';
import {
  IsDate,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export { AccuracyStatus };

@Entity('telemetry')
@Index(['deviceId', 'timestamp'])
export class Telemetry extends BaseEntity {
  @ApiProperty({ description: 'Device UUID (FK)' })
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ description: 'UTC timestamp of the GPS fix' })
  @Column({ type: 'timestamp', nullable: false })
  @IsNotEmpty()
  @IsDate()
  timestamp: Date;

  @ApiProperty({ description: 'Latitude in decimal degrees (WGS84)' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsLatitude()
  lat: number;

  @ApiProperty({ description: 'Longitude in decimal degrees (WGS84)' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsLongitude()
  lng: number;

  @ApiProperty({ description: 'Speed in km/h reported by device' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  speed: number;

  @ApiProperty({ description: 'Heading in degrees (0–360)' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading: number;

  @ApiProperty({ description: 'Altitude in metres above sea level' })
  @Column({ type: 'float', nullable: false })
  @IsNotEmpty()
  @IsNumber()
  altitude: number;

  @ApiProperty({ enum: AccuracyStatus, description: 'Sensor fusion mode' })
  @Column({
    type: 'enum',
    enum: AccuracyStatus,
    nullable: false,
    name: 'accuracy_status',
  })
  @IsNotEmpty()
  @IsEnum(AccuracyStatus)
  accuracyStatus: AccuracyStatus;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
