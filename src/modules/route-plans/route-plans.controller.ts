import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import { RoutePlansService } from './route-plans.service';
import { PreviewRouteDto } from './dtos/preview-route.dto';
import { CreateRoutePlanDto } from './dtos/create-route-plan.dto';
import { QueryRoutePlanDto } from './dtos/query-route-plan.dto';
import { ALL_ROLES, Role } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Route Plans')
@Controller('route-plans')
export class RoutePlansController {
  constructor(private readonly routePlansService: RoutePlansService) {}

  @Post('preview')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Preview route using Mapbox Directions' })
  preview(@Body() dto: PreviewRouteDto) {
    return this.routePlansService.preview(dto);
  }

  @Post()
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Create route plan for a device' })
  create(
    @Body() dto: CreateRoutePlanDto,
    @Session() { user }: { user: User },
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.create(dto, user.id, isAdmin);
  }

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all route plans' })
  findAll(@Query() query: QueryRoutePlanDto) {
    return this.routePlansService.findAll(query, '', true);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get my route plans' })
  findMine(
    @Query() query: QueryRoutePlanDto,
    @Session() { user }: { user: User },
  ) {
    return this.routePlansService.findAll(query, user.id, false);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get route plan by id' })
  findOne(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.findOne(id, user.id, isAdmin);
  }

  @Post(':id/activate')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Activate route plan monitoring' })
  activate(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.activate(id, user.id, isAdmin);
  }

  @Post(':id/complete')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Complete route plan' })
  complete(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.complete(id, user.id, isAdmin);
  }

  @Post(':id/cancel')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Cancel route plan' })
  cancel(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.cancel(id, user.id, isAdmin);
  }

  @Delete(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Delete route plan' })
  remove(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.routePlansService.remove(id, user.id, isAdmin);
  }
}
