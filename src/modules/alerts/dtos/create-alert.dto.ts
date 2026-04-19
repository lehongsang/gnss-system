import { IsNotEmpty, IsOptional, IsString, IsUUID, IsLatitude, IsLongitude, IsUrl, IsEnum } from 'class-validator';
import { AlertType } from '../entities/alert.entity';

export class CreateAlertDto {
  @IsUUID('7')
  @IsNotEmpty()
  deviceId: string;

  @IsEnum(AlertType)
  @IsNotEmpty()
  alertType: AlertType;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsUrl()
  snapshotUrl?: string;
}
