import { BaseEntity } from '@/commons/entities/base.entity';
import {
  Column,
  DeleteDateColumn,
  Entity,
} from 'typeorm';
import { MediaStatus } from '@/services/storage/storage.enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

@Entity('medias')
export class Media extends BaseEntity {
  @ApiProperty({ description: 'Stored filename (after processing)' })
  @Column()
  @IsNotEmpty()
  @IsString()
  filename: string;

  @ApiProperty({ description: 'Original filename uploaded by user' })
  @Column()
  @IsNotEmpty()
  @IsString()
  originalName: string;

  @ApiProperty({ description: 'MIME type of the file (e.g. image/webp)' })
  @Column()
  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  @Column({ type: 'bigint' })
  @IsNotEmpty()
  @IsNumber()
  size: number;

  @ApiPropertyOptional({ description: 'S3 object key for presigned URL generation' })
  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  s3Key: string;

  @ApiPropertyOptional({ description: 'Direct URL (legacy, prefer s3Key + presigned URL)' })
  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  url: string;

  @ApiProperty({ enum: MediaStatus, description: 'Upload processing status' })
  @Column({
    type: 'enum',
    enum: MediaStatus,
    default: MediaStatus.PENDING,
  })
  @IsEnum(MediaStatus)
  status: MediaStatus;

  @ApiPropertyOptional()
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
