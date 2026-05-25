import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Device } from './entities/device.entity';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
import {
  DeviceMqttCredentialsDto,
  DeviceProvisioningResponseDto,
} from './dtos/device-provisioning-response.dto';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from '@/commons/dtos/get-many-base.dto';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<Device>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search = '',
    } = query;
    const qb = this.deviceRepository
      .createQueryBuilder('device')
      .leftJoinAndSelect('device.owner', 'owner');

    if (search) {
      qb.where('device.name ILIKE :search', { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy(`device.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findMine(
    ownerId: string,
    query: GetManyBaseQueryParams,
  ): Promise<GetManyBaseResponseDto<Device>> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search = '',
    } = query;
    const qb = this.deviceRepository
      .createQueryBuilder('device')
      .where('device.ownerId = :ownerId', { ownerId });

    if (search) {
      qb.andWhere('device.name ILIKE :search', { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy(`device.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  async findOne(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id },
      relations: ['owner'],
    });
    if (!device) throw new NotFoundException('Device not found');

    if (!isAdmin && device.ownerId !== requesterId) {
      throw new ForbiddenException(
        'You do not have permission to access this device',
      );
    }
    return device;
  }

  async create(
    dto: CreateDeviceDto,
    ownerId: string,
  ): Promise<DeviceProvisioningResponseDto> {
    const device = this.deviceRepository.create({
      ...dto,
      ownerId: dto.ownerId || ownerId, // User gets their ID, Admin can pass ownerId
    });
    const savedDevice = await this.deviceRepository.save(device);
    const mqttPassword = this.generateMqttPassword();
    const mqttUsername = this.buildMqttUsername(savedDevice.id);

    await this.deviceRepository.update(savedDevice.id, {
      mqttUsername,
      mqttPasswordHash: await bcrypt.hash(mqttPassword, 12),
      mqttCredentialsIssuedAt: new Date(),
    });

    const provisionedDevice = await this.findOne(
      savedDevice.id,
      savedDevice.ownerId ?? ownerId,
      true,
    );
    provisionedDevice.mqttUsername = mqttUsername;

    return {
      device: provisionedDevice,
      mqttCredentials: this.buildMqttCredentials(
        provisionedDevice.id,
        mqttUsername,
        mqttPassword,
      ),
    };
  }

  async update(
    id: string,
    dto: UpdateDeviceDto,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Device> {
    const device = await this.findOne(id, requesterId, isAdmin);
    Object.assign(device, dto);
    return this.deviceRepository.save(device);
  }

  /**
   * Reissues MQTT credentials and invalidates the previous device password.
   */
  async regenerateMqttCredentials(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DeviceProvisioningResponseDto> {
    const device = await this.findOne(id, requesterId, isAdmin);
    const mqttPassword = this.generateMqttPassword();
    const mqttUsername = device.mqttUsername ?? this.buildMqttUsername(id);

    await this.deviceRepository.update(id, {
      mqttUsername,
      mqttPasswordHash: await bcrypt.hash(mqttPassword, 12),
      mqttCredentialsIssuedAt: new Date(),
    });

    device.mqttUsername = mqttUsername;
    device.mqttCredentialsIssuedAt = new Date();

    return {
      device,
      mqttCredentials: this.buildMqttCredentials(
        device.id,
        mqttUsername,
        mqttPassword,
      ),
    };
  }

  /**
   * Deletes a device by ID.
   * Uses findOne() internally to ensure the device exists and the requester
   * has ownership (non-admin) before proceeding with deletion.
   */
  async remove(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<DefaultMessageResponseDto> {
    const device = await this.findOne(id, requesterId, isAdmin);
    await this.deviceRepository.remove(device);
    return { message: 'Device deleted successfully' };
  }

  /**
   * Finds a device by ID without ownership check.
   * Used by device-facing APIs (e.g. presigned URL upload) where
   * there is no authenticated user session.
   *
   * @param id - The device UUID
   * @returns The device entity
   * @throws NotFoundException if device does not exist
   */
  async findOneById(id: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({
      where: { id },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  /**
   * Finds a device including its MQTT password hash for broker authentication.
   */
  async findByMqttUsernameWithSecret(
    mqttUsername: string,
  ): Promise<Device | null> {
    return this.deviceRepository
      .createQueryBuilder('device')
      .addSelect('device.mqttPasswordHash')
      .where('device.mqttUsername = :mqttUsername', { mqttUsername })
      .getOne();
  }

  /**
   * Verifies device MQTT credentials using the stored password hash.
   */
  async verifyMqttCredentials(
    mqttUsername: string,
    mqttPassword: string,
  ): Promise<Device | null> {
    const device = await this.findByMqttUsernameWithSecret(mqttUsername);
    if (!device?.mqttPasswordHash) {
      return null;
    }

    const isValidPassword = await bcrypt.compare(
      mqttPassword,
      device.mqttPasswordHash,
    );
    return isValidPassword ? device : null;
  }

  /**
   * Builds the canonical MQTT username for a device.
   */
  private buildMqttUsername(deviceId: string): string {
    return `device:${deviceId}`;
  }

  /**
   * Generates a high-entropy MQTT password that is shown only once.
   */
  private generateMqttPassword(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Builds the provisioning payload expected by frontend and devices.
   */
  private buildMqttCredentials(
    deviceId: string,
    mqttUsername: string,
    mqttPassword: string,
  ): DeviceMqttCredentialsDto {
    const mqttHost = this.configService.get<string>(
      'MQTT_PUBLIC_HOST',
      this.configService.get<string>('MQTT_HOST', 'localhost'),
    );
    const mqttPort = Number(
      this.configService.get<string>(
        'MQTT_PUBLIC_PORT',
        this.configService.get<string>('MQTT_PORT', '1883'),
      ),
    );
    const mqttProtocol = this.configService.get<string>(
      'MQTT_PUBLIC_PROTOCOL',
      this.configService.get<string>('MQTT_PROTOCOL', 'mqtt'),
    );

    return {
      deviceId,
      mqttUsername,
      mqttPassword,
      mqttHost,
      mqttPort,
      mqttProtocol,
      topics: {
        coordinates: `gnss/${deviceId}/coordinates`,
        status: `gnss/${deviceId}/status`,
        alert: `gnss/${deviceId}/alert`,
        image: `gnss/${deviceId}/image`,
        video: `gnss/${deviceId}/video`,
        streamStatus: `gnss/${deviceId}/stream/status`,
        commands: `gnss/${deviceId}/command/#`,
      },
    };
  }
}
