import { IsOptional, IsEnum, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { DeviceStatusEnum } from '../entities/device-status.entity';

export class UpdateDeviceStatusDto {
  @IsOptional()
  @IsEnum(DeviceStatusEnum)
  status?: DeviceStatusEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @IsOptional()
  @IsBoolean()
  cameraStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  gnssStatus?: boolean;
}
