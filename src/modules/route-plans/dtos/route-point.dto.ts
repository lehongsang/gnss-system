import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNotEmpty } from 'class-validator';

export class RoutePointDto {
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
}
