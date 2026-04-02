import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { AccuracyStatus } from '../entities/telemetry.entity';

export class CreateTelemetryDto {
  @ApiProperty({ description: 'Device ID' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ description: 'Latitude' })
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Longitude' })
  @IsNumber()
  lng: number;

  @ApiProperty({ description: 'Altitude (metres)', required: false })
  @IsOptional()
  @IsNumber()
  alt?: number;

  @ApiProperty({ enum: AccuracyStatus, required: false })
  @IsOptional()
  @IsEnum(AccuracyStatus)
  accuracyStatus?: AccuracyStatus;
}

export class GetTelemetryQueryDto {
  @ApiProperty({ description: 'Device ID to filter by' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ description: 'Start time (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({ description: 'End time (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiProperty({ description: 'Max number of records to return', required: false, example: 500 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
