import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '@thallesp/nestjs-better-auth';
import { MediaLogsService } from './media-logs.service';
import { GetMediaLogsQueryDto } from './dtos/media-log.dto';
import { MediaLog } from './entities/media-log.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';

@ApiTags('Media Logs')
@Controller('media-logs')
export class MediaLogsController {
  constructor(private readonly mediaLogsService: MediaLogsService) {}

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - List media logs',
    description: 'Paginated list of device media logs (video chunks / image frames) with time-range filter.',
    response: { serialization: GetManyBaseResponseDto },
  })
  async findAll(@Query() query: GetMediaLogsQueryDto) {
    return this.mediaLogsService.findAll(query);
  }

  @Get(':id')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get a media log by ID',
    response: { serialization: MediaLog },
    request: { params: [{ name: 'id', required: true }] },
  })
  async findOne(@Param('id') id: string): Promise<MediaLog> {
    return this.mediaLogsService.findOne(id);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Delete a media log',
    response: { httpStatus: HttpStatus.NO_CONTENT },
    request: { params: [{ name: 'id', required: true }] },
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.mediaLogsService.remove(id);
  }
}
