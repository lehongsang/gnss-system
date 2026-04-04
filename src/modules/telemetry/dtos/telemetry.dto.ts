import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccuracyStatus } from '@/commons/enums/app.enum';
import { LocationDto } from '@/commons/dtos/location.dto';

export class CreateTelemetryDto {
  @ApiProperty({ description: 'Device ID' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ type: () => LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

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
