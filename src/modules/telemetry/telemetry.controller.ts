import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryDto, GetTelemetryQueryDto } from './dtos/telemetry.dto';
import { Telemetry } from './entities/telemetry.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';

@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.CREATED)
  @Doc({
    summary: 'Role: Admin - Ingest a telemetry point',
    description: 'Save a new GPS/GNSS telemetry record for a device.',
    response: { serialization: Telemetry, httpStatus: HttpStatus.CREATED },
  })
  async create(@Body() dto: CreateTelemetryDto): Promise<Telemetry> {
    return this.telemetryService.create(dto);
  }

  @Post('batch')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Batch ingest telemetry points',
    description: 'High-frequency batch insert for 5–10 Hz data streams.',
    response: { httpStatus: HttpStatus.NO_CONTENT },
  })
  async createBatch(@Body() dtos: CreateTelemetryDto[]): Promise<void> {
    return this.telemetryService.createBatch(dtos);
  }

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Query telemetry by device & time range',
    description: 'Retrieve telemetry records filtered by deviceId and optional time window.',
    response: { serialization: Telemetry, isArray: true },
  })
  async findByDevice(@Query() query: GetTelemetryQueryDto): Promise<Telemetry[]> {
    return this.telemetryService.findByDevice(query);
  }

  @Get(':deviceId/latest')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get latest telemetry for a device',
    response: { serialization: Telemetry },
    request: {
      params: [{ name: 'deviceId', description: 'Device UUID', required: true }],
    },
  })
  async findLatest(@Param('deviceId') deviceId: string): Promise<Telemetry | null> {
    return this.telemetryService.findLatest(deviceId);
  }
}
