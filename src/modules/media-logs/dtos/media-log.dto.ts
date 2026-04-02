import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MediaLogType } from '../entities/media-log.entity';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';

export class GetMediaLogsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ description: 'Filter by device ID', required: false })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ enum: MediaLogType, required: false })
  @IsOptional()
  @IsEnum(MediaLogType)
  mediaType?: MediaLogType;

  @ApiProperty({ description: 'Start time filter (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({ description: 'End time filter (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  to?: string;
}
