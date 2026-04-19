import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { GeofencesService } from './geofences.service';
import { CreateGeofenceDto, AssignDeviceDto } from './dtos/create-geofence.dto';
import { UpdateGeofenceDto } from './dtos/update-geofence.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Geofences')
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all geofences' })
  findAll(@Query() query: GetManyBaseQueryParams) {
    return this.geofencesService.findAll(query, '', true);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get my geofences' })
  findMine(@Session() user: User, @Query() query: GetManyBaseQueryParams) {
    return this.geofencesService.findAll(query, user.id, false);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get geofence by id' })
  findOne(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.geofencesService.findOne(id, user.id, isAdmin);
  }

  @Post()
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Create a geofence' })
  create(@Body() dto: CreateGeofenceDto, @Session() user: User) {
    return this.geofencesService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Update geofence' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGeofenceDto,
    @Session() user: User,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.geofencesService.update(id, dto, user.id, isAdmin);
  }

  @Delete(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Delete geofence' })
  remove(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.geofencesService.remove(id, user.id, isAdmin);
  }

  @Post(':id/devices')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Assign device to geofence' })
  async assignDevice(
    @Param('id') id: string,
    @Body() dto: AssignDeviceDto,
    @Session() user: User,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    // ensure caller owns it
    await this.geofencesService.findOne(id, user.id, isAdmin);
    return this.geofencesService.assignDevice(id, dto.deviceId);
  }

  @Delete(':id/devices/:deviceId')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Remove device from geofence' })
  async removeDevice(
    @Param('id') id: string,
    @Param('deviceId') deviceId: string,
    @Session() user: User,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    await this.geofencesService.findOne(id, user.id, isAdmin);
    return this.geofencesService.removeDevice(id, deviceId);
  }
}
