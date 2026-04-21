import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { DeviceStatusEnum } from '@/commons/enums/app.enum';

export class UpdateDeviceStatusDto {
  @ApiProperty({ enum: DeviceStatusEnum, description: 'Operational status of the device' })
  @IsNotEmpty()
  @IsEnum(DeviceStatusEnum)
  status: DeviceStatusEnum;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'Battery level as percentage' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel: number;

  @ApiProperty({ description: 'Whether the on-board camera is operational' })
  @IsNotEmpty()
  @IsBoolean()
  cameraStatus: boolean;

  @ApiProperty({ description: 'Whether the GNSS receiver is operational' })
  @IsNotEmpty()
  @IsBoolean()
  gnssStatus: boolean;
}
