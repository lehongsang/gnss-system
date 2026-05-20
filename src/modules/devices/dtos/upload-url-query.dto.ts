import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetUploadUrlQueryDto {
  @ApiProperty({ description: 'Tên file gốc (ví dụ: camera_1.jpg)', example: 'camera_1.jpg' })
  @IsNotEmpty()
  @IsString()
  filename: string;

  @ApiProperty({
    description: 'MIME type của file (ví dụ: image/jpeg)',
    example: 'image/jpeg',
    required: false,
    default: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;
}
