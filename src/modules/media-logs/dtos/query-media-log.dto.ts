import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsEnum, IsDateString } from 'class-validator';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { MediaType } from '@/commons/enums/app.enum';

export class MediaLogQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
