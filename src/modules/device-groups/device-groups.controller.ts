import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeviceGroupsService } from './device-groups.service';
import { CreateDeviceGroupDto } from './dtos/create-device-group.dto';
import { UpdateDeviceGroupDto } from './dtos/update-device-group.dto';
import { DeviceGroupQueryDto } from './dtos/device-group-query.dto';
import { AssignDevicesDto } from './dtos/assign-devices.dto';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Device Groups')
@Controller('device-groups')
export class DeviceGroupsController {
  constructor(private readonly deviceGroupsService: DeviceGroupsService) {}

  /**
   * Tạo nhóm thiết bị mới
   */
  @Post()
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Tạo nhóm thiết bị',
    description: 'Tạo một nhóm thiết bị mới cho user đang đăng nhập',
  })
  create(
    @Session() { user }: { user: User },
    @Body() createDeviceGroupDto: CreateDeviceGroupDto,
  ) {
    return this.deviceGroupsService.create(user.id, createDeviceGroupDto);
  }

  /**
   * Lấy danh sách nhóm thiết bị
   */
  @Get()
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Lấy danh sách nhóm thiết bị',
    description: 'Trả về danh sách nhóm kèm số lượng thiết bị của mỗi nhóm',
  })
  findAll(
    @Session() { user }: { user: User },
    @Query() query: DeviceGroupQueryDto,
  ) {
    return this.deviceGroupsService.findAll(user.id, query);
  }

  /**
   * Lấy chi tiết nhóm thiết bị
   */
  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Lấy chi tiết nhóm thiết bị',
    errors: [
      { status: HttpStatus.NOT_FOUND, errorCode: 'DEVICE_GROUP_NOT_FOUND', message: 'Device group not found' },
    ],
  })
  findOne(@Session() { user }: { user: User }, @Param('id') id: string) {
    return this.deviceGroupsService.findOne(id, user.id);
  }

  /**
   * Cập nhật thông tin nhóm thiết bị
   */
  @Patch(':id')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Cập nhật nhóm thiết bị',
    errors: [
      { status: HttpStatus.NOT_FOUND, errorCode: 'DEVICE_GROUP_NOT_FOUND', message: 'Device group not found' },
    ],
  })
  update(
    @Session() { user }: { user: User },
    @Param('id') id: string,
    @Body() updateDeviceGroupDto: UpdateDeviceGroupDto,
  ) {
    return this.deviceGroupsService.update(id, user.id, updateDeviceGroupDto);
  }

  /**
   * Xóa nhóm thiết bị
   */
  @Delete(':id')
  @Roles(ALL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: All - Xóa nhóm thiết bị',
    description: 'Khi xóa nhóm, các thiết bị thuộc nhóm sẽ bị gỡ khỏi nhóm',
    errors: [
      { status: HttpStatus.NOT_FOUND, errorCode: 'DEVICE_GROUP_NOT_FOUND', message: 'Device group not found' },
    ],
  })
  remove(@Session() { user }: { user: User }, @Param('id') id: string) {
    return this.deviceGroupsService.remove(id, user.id);
  }

  /**
   * Gán thiết bị vào nhóm
   */
  @Post(':id/devices')
  @Roles(ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Role: All - Gán thiết bị vào nhóm',
    description: 'Gán hàng loạt thiết bị vào nhóm. Những thiết bị không thuộc sở hữu của user sẽ bị bỏ qua.',
    errors: [
      { status: HttpStatus.NOT_FOUND, errorCode: 'DEVICE_GROUP_NOT_FOUND', message: 'Device group not found' },
    ],
  })
  assignDevices(
    @Session() { user }: { user: User },
    @Param('id') id: string,
    @Body() dto: AssignDevicesDto,
  ) {
    return this.deviceGroupsService.assignDevices(id, user.id, dto.deviceIds);
  }

  /**
   * Gỡ thiết bị khỏi nhóm
   */
  @Delete(':id/devices')
  @Roles(ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Role: All - Gỡ thiết bị khỏi nhóm',
    errors: [
      { status: HttpStatus.NOT_FOUND, errorCode: 'DEVICE_GROUP_NOT_FOUND', message: 'Device group not found' },
    ],
  })
  removeDevices(
    @Session() { user }: { user: User },
    @Param('id') id: string,
    @Body() dto: AssignDevicesDto,
  ) {
    return this.deviceGroupsService.removeDevices(id, user.id, dto.deviceIds);
  }
}
