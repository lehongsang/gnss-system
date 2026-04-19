import {
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum AccuracyStatus {
  GNSS_ONLY = 'gnss_only',
  VISION_ONLY = 'vision_only',
  FUSED = 'fused',
}

@Entity('telemetry')
@Index(['deviceId', 'timestamp'])
export class Telemetry {
  @ApiProperty()
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ApiProperty()
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: false })
  timestamp: Date;

  @ApiProperty()
  @Column({ type: 'float', nullable: false })
  lat: number;

  @ApiProperty()
  @Column({ type: 'float', nullable: false })
  lng: number;

  @ApiProperty({ enum: AccuracyStatus, required: false })
  @Column({
    type: 'enum',
    enum: AccuracyStatus,
    nullable: true,
    name: 'accuracy_status',
  })
  accuracyStatus: AccuracyStatus | null;
}
