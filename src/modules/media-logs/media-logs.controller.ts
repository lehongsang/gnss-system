import { Controller, Get, Param, Query } from '@nestjs/common';
import { MediaLogsService } from './media-logs.service';
import { MediaLogQueryDto } from './dtos/query-media-log.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Media Logs')
@Controller('media-logs')
export class MediaLogsController {
  constructor(private readonly mediaLogsService: MediaLogsService) {}

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all media logs' })
  findAll(@Query() query: MediaLogQueryDto) {
    return this.mediaLogsService.findAll(query, '', true);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media logs for my devices' })
  findMine(@Session() user: User, @Query() query: MediaLogQueryDto) {
    return this.mediaLogsService.findAll(query, user.id, false);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media log by id' })
  findOne(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.findOne(id, user.id, isAdmin);
  }

  @Get(':id/stream')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get medial log stream url' })
  getStreamUrl(@Param('id') id: string, @Session() user: User) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.getStreamUrl(id, user.id, isAdmin);
  }
}
