import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class SendCommandDto {
  @ApiProperty({
    description: 'Tên lệnh gửi xuống thiết bị',
    example: 'capture_media',
    enum: ['capture_media', 'update_config', 'system', 'alarm'],
  })
  @IsNotEmpty()
  @IsString()
  command: string;

  @ApiProperty({
    description: 'Payload dữ liệu đính kèm lệnh',
    example: { mediaType: 'image', resolution: '1080p' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
