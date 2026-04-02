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
import { AlertsService } from './alerts.service';
import { CreateAlertDto, GetAlertsQueryDto, ResolveAlertDto } from './dtos/alert.dto';
import { Alert } from './entities/alert.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.CREATED)
  @Doc({
    summary: 'Role: Admin - Create an alert',
    description: 'Manually create an alert record for a device.',
    response: { serialization: Alert, httpStatus: HttpStatus.CREATED },
  })
  async create(@Body() dto: CreateAlertDto): Promise<Alert> {
    return this.alertsService.create(dto);
  }

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - List alerts',
    description: 'Paginated list of alerts with optional filters by device, type, or resolved status.',
    response: { serialization: GetManyBaseResponseDto },
  })
  async findAll(@Query() query: GetAlertsQueryDto) {
    return this.alertsService.findAll(query);
  }

  @Get(':id')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get an alert by ID',
    response: { serialization: Alert },
    request: { params: [{ name: 'id', required: true }] },
  })
  async findOne(@Param('id') id: string): Promise<Alert> {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/resolve')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Resolve or re-open an alert',
    response: { serialization: Alert },
    request: { params: [{ name: 'id', required: true }] },
  })
  async resolve(@Param('id') id: string, @Body() dto: ResolveAlertDto): Promise<Alert> {
    return this.alertsService.resolve(id, dto);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Delete an alert',
    response: { httpStatus: HttpStatus.NO_CONTENT },
    request: { params: [{ name: 'id', required: true }] },
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.alertsService.remove(id);
  }
}
