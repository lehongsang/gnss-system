import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsLatitude,
  IsLongitude,
  IsUrl,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { AlertType } from '@/commons/enums/app.enum';

export class CreateAlertDto {
  @ApiProperty({ description: 'UUID of the device that triggered the alert' })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ApiProperty({ enum: AlertType, description: 'Category of the alert' })
  @IsNotEmpty()
  @IsEnum(AlertType)
  alertType: AlertType;

  @ApiProperty({ description: 'Human-readable alert message' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiProperty({ example: 10.7769, description: 'Latitude where the alert occurred' })
  @IsNotEmpty()
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 106.6958, description: 'Longitude where the alert occurred' })
  @IsNotEmpty()
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ description: 'URL to a snapshot taken at the time of the alert' })
  @IsOptional()
  @IsUrl()
  snapshotUrl?: string;

  @ApiPropertyOptional({
    description: 'Correlation ID that links this alert to a snapshot media log',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  snapshotId?: string;

  @ApiPropertyOptional({ description: 'Media log UUID for the linked snapshot image' })
  @IsOptional()
  @IsUUID('7')
  snapshotMediaLogId?: string;
}
