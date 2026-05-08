import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeviceGroupDto {
  @ApiProperty({ description: 'Tên nhóm thiết bị', example: 'Nhóm xe tải' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết', example: 'Các xe tải đi tuyến Bắc - Nam' })
  @IsOptional()
  @IsString()
  description?: string;
}
