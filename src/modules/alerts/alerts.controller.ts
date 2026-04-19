import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertQueryDto } from './dtos/query-alert.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all alerts' })
  findAll(@Query() query: AlertQueryDto) {
    return this.alertsService.findAll(query, '', true);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get alerts for my devices' })
  findMine(@Session() user: User, @Query() query: AlertQueryDto) {
    return this.alertsService.findAll(query, user.id, false);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get alert by id' })
  findOne(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.alertsService.findOne(id, user.id, isAdmin);
  }

  @Patch(':id/resolve')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Resolve alert' })
  resolve(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.alertsService.resolve(id, user.id, isAdmin);
  }
}
