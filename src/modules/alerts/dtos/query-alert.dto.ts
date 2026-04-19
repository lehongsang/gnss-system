import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { AlertType } from '../entities/alert.entity';

export class AlertQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: AlertType })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isResolved?: boolean;
}
