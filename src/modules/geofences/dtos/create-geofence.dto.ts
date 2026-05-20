import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateGeofenceDto {
  @ApiProperty({ example: 'Khu vực an toàn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({
    description: 'GeoJSON Polygon coordinates',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [106.0, 10.0],
          [106.5, 10.0],
          [106.5, 10.5],
          [106.0, 10.0],
        ],
      ],
    },
  })
  @IsNotEmpty()
  @IsObject()
  geom!: object;
}

export class AssignDeviceDto {
  @ApiProperty()
  @IsUUID('7')
  @IsNotEmpty()
  deviceId!: string;
}
