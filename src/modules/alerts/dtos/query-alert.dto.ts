import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { AlertType } from '@/commons/enums/app.enum';

export class AlertQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional({ description: 'Filter by device UUID' })
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: AlertType, description: 'Filter by alert type' })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @ApiPropertyOptional({ description: 'Filter by resolution status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isResolved?: boolean;
}
