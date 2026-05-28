import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { RoutePlanStatus } from '@/commons/enums/app.enum';

export class QueryRoutePlanDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: RoutePlanStatus })
  @IsOptional()
  @IsEnum(RoutePlanStatus)
  status?: RoutePlanStatus;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
