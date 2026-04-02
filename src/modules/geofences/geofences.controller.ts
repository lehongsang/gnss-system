import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import { GeofencesService } from './geofences.service';
import {
  AssignDeviceGeofenceDto,
  CreateGeofenceDto,
  GetGeofencesQueryDto,
} from './dtos/geofence.dto';
import { Geofence } from './entities/geofence.entity';
import { DeviceGeofence } from './entities/device-geofence.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';

@ApiTags('Geofences')
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Post()
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.CREATED)
  @Doc({
    summary: 'Role: Admin - Create a geofence',
    description: 'Define a new PostGIS Polygon geofence zone.',
    response: { serialization: Geofence, httpStatus: HttpStatus.CREATED },
  })
  async create(
    @Body() dto: CreateGeofenceDto,
    @Session() { user }: { user: User },
  ): Promise<Geofence> {
    return this.geofencesService.create(dto, user.id);
  }

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - List geofences',
    response: { serialization: Geofence, isArray: true },
  })
  async findAll(@Query() query: GetGeofencesQueryDto): Promise<Geofence[]> {
    return this.geofencesService.findAll(query);
  }

  @Get(':id')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get a geofence by ID',
    response: { serialization: Geofence },
    request: { params: [{ name: 'id', required: true }] },
  })
  async findOne(@Param('id') id: string): Promise<Geofence> {
    return this.geofencesService.findOne(id);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Delete a geofence',
    response: { httpStatus: HttpStatus.NO_CONTENT },
    request: { params: [{ name: 'id', required: true }] },
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.geofencesService.remove(id);
  }

  @Post('assign-device')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.CREATED)
  @Doc({
    summary: 'Role: Admin - Assign a device to a geofence',
    response: { serialization: DeviceGeofence, httpStatus: HttpStatus.CREATED },
  })
  async assignDevice(@Body() dto: AssignDeviceGeofenceDto): Promise<DeviceGeofence> {
    return this.geofencesService.assignDevice(dto);
  }

  @Delete('assign-device')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Remove a device from a geofence',
    response: { httpStatus: HttpStatus.NO_CONTENT },
  })
  async removeDevice(@Body() dto: AssignDeviceGeofenceDto): Promise<void> {
    return this.geofencesService.removeDevice(dto);
  }

  @Get(':id/devices')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - List devices assigned to a geofence',
    response: { serialization: DeviceGeofence, isArray: true },
    request: { params: [{ name: 'id', required: true }] },
  })
  async findDevices(@Param('id') id: string): Promise<DeviceGeofence[]> {
    return this.geofencesService.findDevices(id);
  }
}
