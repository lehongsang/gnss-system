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
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all devices (paginated)' })
  findAll(@Query() query: GetManyBaseQueryParams) {
    return this.devicesService.findAll(query);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get my devices' })
  findMine(@Session() user: User, @Query() query: GetManyBaseQueryParams) {
    return this.devicesService.findMine(user.id, query);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get device by id' })
  findOne(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.devicesService.findOne(id, user.id, isAdmin);
  }

  @Post()
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Create new device' })
  create(@Body() dto: CreateDeviceDto, @Session() user: User) {
    return this.devicesService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Update device' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @Session() user: User,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.devicesService.update(id, dto, user.id, isAdmin);
  }

  @Delete(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Delete device (ownership validated)' })
  remove(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.devicesService.remove(id, user.id, isAdmin);
  }
}
