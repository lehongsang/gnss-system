import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import { ALL_ROLES, Role } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { LiveStreamsService } from './live-streams.service';
import { StartLiveStreamDto } from './dtos/start-live-stream.dto';
import { LiveStreamResponse } from './dtos/live-stream.response';

@ApiTags('Live Streams')
@Controller('live-streams')
export class LiveStreamsController {
  constructor(private readonly liveStreamsService: LiveStreamsService) {}

  @Post(':deviceId/start')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Start RTSP live stream for a device',
    response: { serialization: LiveStreamResponse },
  })
  start(
    @Param('deviceId') deviceId: string,
    @Body() dto: StartLiveStreamDto,
    @Session() { user }: { user: User },
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.liveStreamsService.start(deviceId, user.id, isAdmin, dto);
  }

  @Post(':deviceId/stop')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Stop RTSP live stream for a device',
    response: { serialization: LiveStreamResponse },
  })
  stop(
    @Param('deviceId') deviceId: string,
    @Session() { user }: { user: User },
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.liveStreamsService.stop(deviceId, user.id, isAdmin);
  }

  @Get(':deviceId/status')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Get current live stream status for a device',
    response: { serialization: LiveStreamResponse },
  })
  getStatus(
    @Param('deviceId') deviceId: string,
    @Session() { user }: { user: User },
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.liveStreamsService.getStatus(deviceId, user.id, isAdmin);
  }
}
