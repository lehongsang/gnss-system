import { Controller, Get, Post, Param, Query, Body, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { MediaLogsService } from './media-logs.service';
import { MediaLogQueryDto } from './dtos/query-media-log.dto';
import { RequestUploadUrlDto } from './dtos/request-upload-url.dto';
import { ConfirmUploadDto } from './dtos/confirm-upload.dto';
import { ApiBasicAuth, ApiTags } from '@nestjs/swagger';
import { Session, Roles, AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { User } from '@/modules/auth/entities/user.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { DeviceAuthGuard } from '@/commons/guards/device-auth.guard';
import { DevicesService } from '@/modules/devices/devices.service';

@ApiTags('Media Logs')
@Controller('media-logs')
export class MediaLogsController {
  constructor(
    private readonly mediaLogsService: MediaLogsService,
    private readonly devicesService: DevicesService,
  ) {}

  // ─── Presigned URL Upload Flow (Device-facing, with Basic Auth) ────────────

  @Post('request-upload-url')
  @AllowAnonymous()
  @UseGuards(DeviceAuthGuard)
  @ApiBasicAuth('device-basic')
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
  @AllowAnonymous()
  @UseGuards(DeviceAuthGuard)
  @ApiBasicAuth('device-basic')
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

  @Get('map-pins')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get map pins representing geo-tagged media logs' })
  findMapPins(@Session() { user }: { user: User }, @Query() query: MediaLogQueryDto) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.findMapPins(query, user.id, isAdmin);
  }

  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get media log by id' })
  findOne(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.findOne(id, user.id, isAdmin);
  }

  @Get(':id/stream')
  @AllowAnonymous()
  @Doc({ summary: 'Role: All or Device - Get media log stream url' })
  async getStreamUrl(
    @Param('id') id: string,
    @Req() request: Request, 
    @Session() session: { user?: User } | null | undefined,
    @Query('type') type?: 'raw' | 'processed',
  ) {
    // 1. Try User Session authentication first
    if (session && session.user) {
      const user = session.user;
      const isAdmin = user.role === Role.ADMIN;
      return this.mediaLogsService.getStreamUrl(id, user.id, isAdmin, type || 'raw');
    }

    // 2. Try Device Basic Auth authentication
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.substring(6);
      let decoded: string;
      try {
        decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      } catch {
        throw new UnauthorizedException('Failed to decode Basic auth credentials.');
      }

      const lastColonIndex = decoded.lastIndexOf(':');
      if (lastColonIndex === -1) {
        throw new UnauthorizedException('Invalid Authorization header format.');
      }

      const username = decoded.slice(0, lastColonIndex);
      const password = decoded.slice(lastColonIndex + 1);

      const device = await this.devicesService.verifyMqttCredentials(username, password);
      if (device) {
        // Authenticated as a device, allow access to stream url by passing isAdmin = true
        return this.mediaLogsService.getStreamUrl(id, '', true, type || 'raw');
      }
    }

    throw new UnauthorizedException('Unauthorized');
  }

  @Post(':id/analyze')
  @Roles(ALL_ROLES)
  @Doc({
    summary: 'Role: All - Trigger Optical Flow AI processing for a video log',
    description: 'Triggers the Python AI local worker via Kafka to estimate motion on the video chunk.',
  })
  analyze(
    @Param('id') id: string,
    @Session() { user }: { user: User },
    @Body() body: { mode?: 'VECTORS' | 'HEATMAP'; isMoving?: boolean },
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.mediaLogsService.requestOpticalFlowAnalysis(
      id,
      user.id,
      isAdmin,
      body.mode || 'VECTORS',
      body.isMoving !== undefined ? body.isMoving : true,
    );
  }
}

