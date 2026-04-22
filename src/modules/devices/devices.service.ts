import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { CreateDeviceDto } from './dtos/create-device.dto';
import { UpdateDeviceDto } from './dtos/update-device.dto';
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

  async create(dto: CreateDeviceDto, ownerId: string): Promise<Device> {
    const device = this.deviceRepository.create({
      ...dto,
      ownerId: dto.ownerId || ownerId, // User gets their ID, Admin can pass ownerId
    });
    return this.deviceRepository.save(device);
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

  async findByMac(macAddress: string): Promise<Device | null> {
    return this.deviceRepository.findOneBy({ macAddress });
  }
}
