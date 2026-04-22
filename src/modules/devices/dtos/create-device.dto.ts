import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: 'Drone Camera #01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'AA:BB:CC:DD:EE:FF' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, {
    message: 'Invalid MAC address format',
  })
  macAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  ownerId?: string;

  @ApiPropertyOptional({
    example: 80,
    description: 'Ngưỡng tốc độ tối đa (km/h). null = không giám sát tốc độ.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  speedLimitKmh?: number;
}
