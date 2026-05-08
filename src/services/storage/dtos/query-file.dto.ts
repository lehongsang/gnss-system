import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StorageFileQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional({ description: 'Filter by type: archive/document/video/image' })
  @IsOptional()
  @IsString()
  type?: string;
}
