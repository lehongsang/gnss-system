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
      ownerId: dto.ownerId || ownerId, // User thường thì lấy ID của chính mình, Admin có thể chỉ định ownerId khác
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
   * Cấp lại thông tin đăng nhập MQTT mới, vô hiệu hóa mật khẩu cũ của thiết bị.
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
   * Xóa thiết bị theo ID.
   * Gọi findOne() bên trong để đảm bảo thiết bị tồn tại và requester
   * có quyền sở hữu (nếu không phải admin) trước khi xóa.
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
   * Tìm thiết bị theo ID mà không kiểm tra quyền sở hữu.
   * Dùng cho các API gọi trực tiếp từ thiết bị (vd: presigned URL upload)
   * vì lúc này không có session user đăng nhập.
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
   * Tìm thiết bị kèm theo MQTT password hash để broker xác thực.
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
   * Xác thực thông tin đăng nhập MQTT của thiết bị bằng password hash đã lưu.
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
   * Tạo MQTT username chuẩn cho thiết bị.
   */
  private buildMqttUsername(deviceId: string): string {
    return `device:${deviceId}`;
  }

  /**
   * Sinh mật khẩu MQTT có độ ngẫu nhiên cao, chỉ hiển thị cho user đúng một lần.
   */
  private generateMqttPassword(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Tạo payload provisioning theo đúng format mà frontend và thiết bị mong đợi.
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
