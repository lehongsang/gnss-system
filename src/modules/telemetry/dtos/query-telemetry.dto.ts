import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsLatitude, IsLongitude, IsNumber, Min, Max } from 'class-validator';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { Transform } from 'class-transformer';

export class TelemetryHistoryQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  to: string;
}

export class NearbyQueryDto {
  @ApiProperty({ example: 10.7769 })
  @IsLatitude()
  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  lat: number;

  @ApiProperty({ example: 106.6958 })
  @IsLongitude()
  @IsNotEmpty()
  @Transform(({ value }) => Number(value))
  lng: number;

  @ApiProperty({ example: 500, description: 'Bán kính tính bằng mét' })
  @IsNumber()
  @Min(1)
  @Max(50000)
  @Transform(({ value }) => Number(value))
  radius: number;
}
