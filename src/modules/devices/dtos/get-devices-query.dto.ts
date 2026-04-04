import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { DeviceStatus } from '@/commons/enums/app.enum';

export class GetDevicesQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    description: 'Filter by device name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    enum: DeviceStatus,
    description: 'Filter by device status',
    required: false,
  })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiProperty({
    description: 'Filter by owner ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
