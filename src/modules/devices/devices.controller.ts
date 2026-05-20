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
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import { GetDevicesQueryDto } from './dtos/get-devices-query.dto';
import { GetUploadUrlQueryDto } from './dtos/upload-url-query.dto';
import { ConfirmUploadDto } from './dtos/confirm-upload.dto';
import { SendCommandDto } from './dtos/send-command.dto';
import { Device } from './entities/device.entity';
import { Doc } from '@/commons/docs/doc.decorator';
import { Role } from '@/commons/enums/app.enum';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { getManyResponse } from '@/utils/getManyResponse';
import { StorageService } from '@/services/storage/storage.service';
import { MediaLogsService } from '@/modules/media-logs/media-logs.service';
import { MqttService } from '@/services/mqtt/mqtt.service';

@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly storageService: StorageService,
    private readonly mediaLogsService: MediaLogsService,
    private readonly mqttService: MqttService,
  ) {}

  @Post()
  @Roles([Role.ADMIN])
  @Doc({
    summary: 'Role: Admin - Create a new device',
    description: 'Create a new GNSS device in the system.',
    response: { serialization: Device, httpStatus: HttpStatus.CREATED },
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDeviceDto): Promise<Device> {
    return this.devicesService.create(dto);
  }

  @Get()
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get list of devices',
    description: 'Retrieve a paginated list of devices with optional filters.',
    response: {
      serialization: GetManyBaseResponseDto,
      httpStatus: HttpStatus.OK,
    },
  })
  async findAll(@Query() query: GetDevicesQueryDto) {
    const [data, total] = await this.devicesService.findAll(query);
    return getManyResponse({ query, data, total });
  }

  @Get(':id')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get a device by ID',
    description: 'Retrieve a single device by its UUID.',
    response: { serialization: Device },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async findOne(@Param('id') id: string): Promise<Device> {
    return this.devicesService.findOne(id);
  }

  @Patch(':id')
  @Roles([Role.ADMIN])
  @Doc({
    summary: 'Role: Admin - Update a device',
    description: 'Update device information by UUID.',
    response: { serialization: Device },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ): Promise<Device> {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: 'Role: Admin - Delete a device',
    description: 'Remove a device from the system by UUID.',
    response: { httpStatus: HttpStatus.NO_CONTENT },
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.devicesService.remove(id);
  }

  // ──────────────────────────────────────────────────────────────
  //  MQTT Commands — Send commands to IoT devices
  // ──────────────────────────────────────────────────────────────

  /**
   * Send a command to a specific device via MQTT.
   *
   * The command is published to topic `devices/{deviceId}/commands/{command}`.
   * The device will receive it and (optionally) reply via `devices/{deviceId}/commands/reply`.
   */
  @Post(':id/commands')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Send a command to a device',
    description:
      'Publish a command to the device via MQTT. Supported commands: capture_media, update_config, system, alarm.',
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async sendCommand(
    @Param('id') id: string,
    @Body() dto: SendCommandDto,
  ) {
    // Validate device exists
    await this.devicesService.findOne(id);

    const commandPayload = {
      commandId: `cmd-${Date.now()}`,
      ...dto.payload,
    };

    this.mqttService.publishCommand(id, dto.command, commandPayload);

    return {
      message: `Command '${dto.command}' sent to device ${id}`,
      commandId: commandPayload.commandId,
      topic: `devices/${id}/commands/${dto.command}`,
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  PRESIGNED URL — Image Upload Flow
  // ──────────────────────────────────────────────────────────────

  /**
   * STEP 1: Client xin phép upload.
   *
   * Backend sinh ra một Presigned PUT URL trỏ vào SeaweedFS.
   * Client sẽ dùng URL này để upload file binary trực tiếp
   * lên storage mà không đi qua NestJS.
   */
  @Get(':id/upload-url')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Get a presigned URL for direct file upload',
    description:
      'Generate a time-limited presigned PUT URL. The client uploads the file directly to SeaweedFS using this URL.',
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async getUploadUrl(
    @Param('id') id: string,
    @Query() query: GetUploadUrlQueryDto,
  ) {
    // Validate device exists
    await this.devicesService.findOne(id);

    const mimeType = query.mimeType || 'image/jpeg';
    return this.storageService.generatePresignedUrl(
      id,
      query.filename,
      mimeType,
    );
  }

  /**
   * STEP 3: Client xác nhận upload xong.
   *
   * Sau khi PUT file thành công lên SeaweedFS (step 2),
   * client gọi API này để Backend ghi metadata vào DB (bảng media_logs).
   */
  @Post(':id/images/confirm')
  @Roles([Role.ADMIN, Role.USER])
  @Doc({
    summary: 'Role: All - Confirm a completed file upload',
    description:
      'After uploading a file via presigned URL, the client calls this endpoint to save metadata (file location, GPS coordinates) into the database.',
    request: {
      params: [{ name: 'id', description: 'Device UUID', required: true }],
    },
  })
  async confirmUpload(
    @Param('id') id: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    // Validate device exists
    await this.devicesService.findOne(id);

    const fileUrl = this.storageService.getPublicUrl(dto.fileKey);

    return this.mediaLogsService.createFromUpload({
      deviceId: id,
      fileKey: dto.fileKey,
      fileUrl,
      timestamp: dto.timestamp,
      lat: dto.lat,
      lng: dto.lng,
    });
  }
}

