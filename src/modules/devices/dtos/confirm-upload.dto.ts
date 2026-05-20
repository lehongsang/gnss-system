import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty({
    description: 'File key trả về từ bước xin Presigned URL',
    example: 'uploads/devices/abc-123/1715526000-camera_1.jpg',
  })
  @IsNotEmpty()
  @IsString()
  fileKey: string;

  @ApiProperty({
    description: 'Thời điểm chụp ảnh (ISO 8601)',
    example: '2026-05-12T22:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  timestamp?: string;

  @ApiProperty({
    description: 'Vĩ độ nơi chụp',
    example: 10.762622,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({
    description: 'Kinh độ nơi chụp',
    example: 106.660172,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
