import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PreviewRouteDto } from './preview-route.dto';

export class CreateRoutePlanDto extends PreviewRouteDto {
  @ApiProperty()
  @IsUUID('7')
  @IsNotEmpty()
  deviceId: string;

  @ApiPropertyOptional({ example: 'Tuyen giao hang sang' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 50, minimum: 10, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  deviationThresholdMeters?: number;
}
