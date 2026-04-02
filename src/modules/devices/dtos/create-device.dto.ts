import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ description: 'Name of the device', example: 'GNSS Device 01' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'MAC address of the device',
    example: 'AA:BB:CC:DD:EE:FF',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  macAddress?: string;

  @ApiProperty({
    description: 'Owner user ID (UUID)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}