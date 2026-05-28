import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { RoutePointDto } from './route-point.dto';

export class PreviewRouteDto {
  @ApiProperty({ type: RoutePointDto })
  @ValidateNested()
  @Type(() => RoutePointDto)
  @IsNotEmpty()
  origin: RoutePointDto;

  @ApiProperty({ type: RoutePointDto })
  @ValidateNested()
  @Type(() => RoutePointDto)
  @IsNotEmpty()
  destination: RoutePointDto;

  @ApiPropertyOptional({
    example: 'driving',
    enum: ['driving', 'walking', 'cycling'],
  })
  @IsOptional()
  @IsIn(['driving', 'walking', 'cycling'])
  mode?: 'driving' | 'walking' | 'cycling';
}
