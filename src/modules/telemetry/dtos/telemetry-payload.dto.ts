import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TelemetryPayloadDto {
  @IsNotEmpty()
  @IsUUID()
  deviceId: string;

  @IsNotEmpty()
  @IsNumber()
  @IsLongitude()
  lng: number;

  @IsNotEmpty()
  @IsNumber()
  @IsLatitude()
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  speed: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading: number;

  @IsNotEmpty()
  @IsDateString()
  timestamp: string;
}
