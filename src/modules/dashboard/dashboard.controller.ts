import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import { ALL_ROLES } from '@/commons/enums/app.enum';
import { Doc } from '@/commons/docs/doc.decorator';
import { User } from '@/modules/auth/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { DashboardStatsResponse } from './dtos/dashboard-stats.response';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Get current user dashboard statistics',
    response: { serialization: DashboardStatsResponse },
  })
  getStats(@Session() { user }: { user: User }) {
    return this.dashboardService.getStats(user.id);
  }
}
