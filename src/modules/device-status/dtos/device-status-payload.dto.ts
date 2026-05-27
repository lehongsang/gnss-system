import { DeviceStatusEnum } from '@/commons/enums/app.enum';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DeviceStatusPayloadDto {
  @IsNotEmpty()
  @IsUUID()
  deviceId: string;

  @IsNotEmpty()
  @IsEnum(DeviceStatusEnum)
  status: DeviceStatusEnum;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel: number;

  @IsNotEmpty()
  @IsBoolean()
  cameraStatus: boolean;

  @IsNotEmpty()
  @IsBoolean()
  gnssStatus: boolean;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  satellitesTracked: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  signalStrength: number;
}
