import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGeofenceDto {
  @ApiProperty({ description: 'Name of the geofence zone', example: 'Safe Zone A' })
  @IsString()
  @MaxLength(200)
  name: string;

  /**
   * GeoJSON Polygon object. The service will convert it to PostGIS geometry.
   * Example: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
   */
  @ApiProperty({
    description: 'GeoJSON Polygon defining the boundary',
    example: {
      type: 'Polygon',
      coordinates: [[[106.7, 10.7], [106.8, 10.7], [106.8, 10.8], [106.7, 10.8], [106.7, 10.7]]],
    },
  })
  @IsObject()
  @IsNotEmpty()
  geom: object;
}

export class AssignDeviceGeofenceDto {
  @ApiProperty({ description: 'Device ID to assign' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ description: 'Geofence ID to assign to' })
  @IsUUID()
  geofenceId: string;
}

export class GetGeofencesQueryDto {
  @ApiProperty({ description: 'Filter by creator user ID', required: false })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiProperty({ description: 'Search by name', required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
