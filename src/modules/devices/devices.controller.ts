import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import { GetDevicesQueryDto } from './dtos/get-devices-query.dto';
import { Device } from './entities/device.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles([Role.ADMIN])
  @Doc({
    summary: 'Role: Admin - Create a new device',
    description: 'Create a new GNSS device in the system.',
    response: { serialization: Device, httpStatus: HttpStatus.CREATED },
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDeviceDto): Promise<Device> {
    return this.devicesService.create(dto);
  }

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get list of devices',
    description: 'Retrieve a paginated list of devices with optional filters.',
    response: {
      serialization: GetManyBaseResponseDto,
      httpStatus: HttpStatus.OK,
    },
  })
  async findAll(@Query() query: GetDevicesQueryDto) {
    const [data, total] = await this.devicesService.findAll(query);
    return getManyResponse({ query, data, total });
  }

  @Get(':id')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get a device by ID',
    description: 'Retrieve a single device by its UUID.',
    response: { serialization: Device },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async findOne(@Param('id') id: string): Promise<Device> {
    return this.devicesService.findOne(id);
  }

  @Patch(':id')
  @Roles([Role.ADMIN])
  @Doc({
    summary: 'Role: Admin - Update a device',
    description: 'Update device information by UUID.',
    response: { serialization: Device },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ): Promise<Device> {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Delete a device',
    description: 'Remove a device from the system by UUID.',
    response: { httpStatus: HttpStatus.NO_CONTENT },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.devicesService.remove(id);
  }
}
