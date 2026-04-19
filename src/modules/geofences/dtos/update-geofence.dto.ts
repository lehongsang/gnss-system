import { PartialType } from '@nestjs/swagger';
import { CreateGeofenceDto } from './create-geofence.dto';

export class UpdateGeofenceDto extends PartialType(CreateGeofenceDto) {}
