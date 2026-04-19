import { Controller, Get, Param, Query } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import {
  TelemetryHistoryQueryDto,
  NearbyQueryDto,
} from './dtos/query-telemetry.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get(':deviceId/history')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get device telemetry history' })
  getHistory(
    @Param('deviceId') deviceId: string,
    @Query() query: TelemetryHistoryQueryDto,
    @Session() user: User,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.telemetryService.findHistory(deviceId, query, user.id, isAdmin);
  }

  @Get(':deviceId/latest')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get device latest telemetry' })
  getLatest(@Param('deviceId') deviceId: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.telemetryService.findLatest(deviceId, user.id, isAdmin);
  }

  @Get('nearby')
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get nearby telemetry points' })
  getNearby(@Query() query: NearbyQueryDto) {
    return this.telemetryService.findNearby(query);
  }
}
