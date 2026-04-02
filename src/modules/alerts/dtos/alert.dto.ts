import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { AlertType } from '../entities/alert.entity';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';

export class CreateAlertDto {
  @ApiProperty({ description: 'Device ID' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ enum: AlertType, required: false })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @ApiProperty({ description: 'Alert message', required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ description: 'Latitude at alert location', required: false })
  @IsOptional()
  lat?: number;

  @ApiProperty({ description: 'Longitude at alert location', required: false })
  @IsOptional()
  lng?: number;

  @ApiProperty({ description: 'URL to snapshot in object storage', required: false })
  @IsOptional()
  @IsString()
  snapshotUrl?: string;
}

export class GetAlertsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ description: 'Filter by device ID', required: false })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ enum: AlertType, required: false })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @ApiProperty({ description: 'Filter by resolved status', required: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isResolved?: boolean;
}

export class ResolveAlertDto {
  @ApiProperty({ description: 'Mark as resolved' })
  @IsBoolean()
  isResolved: boolean;
}
