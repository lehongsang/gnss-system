import { Controller, Get, Param } from '@nestjs/common';
import { DeviceStatusService } from './device-status.service';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Device Status')
@Controller('devices')
export class DeviceStatusController {
  constructor(private readonly deviceStatusService: DeviceStatusService) {}

  @Get(':id/status')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get device status' })
  getStatus(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.deviceStatusService.findByDevice(id, user.id, isAdmin);
  }
}
