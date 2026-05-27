import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { MediaLogsService } from './media-logs.service';
import { MediaLogQueryDto } from './dtos/query-media-log.dto';
import { RequestUploadUrlDto } from './dtos/request-upload-url.dto';
import { ConfirmUploadDto } from './dtos/confirm-upload.dto';
import { ApiTags } from '@nestjs/swagger';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { DeviceAuthGuard } from '@/commons/guards/device-auth.guard';

@ApiTags('Media Logs')
@Controller('media-logs')
export class MediaLogsController {
  constructor(private readonly mediaLogsService: MediaLogsService) {}

  // ─── Presigned URL Upload Flow (Device-facing, with Basic Auth) ────────────

  @Post('request-upload-url')
  @UseGuards(DeviceAuthGuard)
  @Doc({
    summary: 'Device - Request a presigned S3 upload URL for direct media upload',
    description:
      'IoT devices call this to obtain a time-limited presigned PUT URL. ' +
      'The device then uploads the raw file directly to S3 via HTTP PUT, ' +
      'bypassing the MQTT/Kafka Base64 pipeline. Basic Authentication required.',
  })
  requestUploadUrl(@Body() dto: RequestUploadUrlDto) {
    return this.mediaLogsService.requestUploadUrl(dto);
  }

  @Post('confirm-upload')
  @UseGuards(DeviceAuthGuard)
  @Doc({
    summary: 'Device - Confirm a successful presigned URL upload',
    description:
      'After uploading a file to S3 via the presigned URL, the device calls this ' +
      'endpoint to register the media log in the database. Basic Authentication required.',
  })
  confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.mediaLogsService.confirmUpload(dto);
  }

  // ─── Authenticated Endpoints (User/Admin) ─────────────────────────────────

  @Get()
  @Roles([Role.ADMIN])
  @Doc({ summary: 'Role: Admin - Get all media logs' })
  findAll(@Query() query: MediaLogQueryDto) {
    return this.mediaLogsService.findAll(query, '', true);
  }

  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media logs for my devices' })
  findMine(@Session() { user }: { user: User }, @Query() query: MediaLogQueryDto) {
    return this.mediaLogsService.findAll(query, user.id, false);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media log by id' })
  findOne(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.findOne(id, user.id, isAdmin);
  }

  @Get(':id/stream')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media log stream url' })
  getStreamUrl(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.getStreamUrl(id, user.id, isAdmin);
  }
}

