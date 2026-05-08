import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceGroup } from './entities/device-group.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { CreateDeviceGroupDto } from './dtos/create-device-group.dto';
import { UpdateDeviceGroupDto } from './dtos/update-device-group.dto';
import { DeviceGroupQueryDto } from './dtos/device-group-query.dto';
import { NotFound, ErrorCode } from '@/commons/exceptions';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';

@Injectable()
export class DeviceGroupsService {
  constructor(
    @InjectRepository(DeviceGroup)
    private readonly deviceGroupRepo: Repository<DeviceGroup>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  /**
   * Tạo mới một nhóm thiết bị
   * @param userId ID của người tạo
   * @param dto Dữ liệu tạo nhóm
   * @returns DeviceGroup vừa tạo
   */
  async create(userId: string, dto: CreateDeviceGroupDto): Promise<DeviceGroup> {
    const group = this.deviceGroupRepo.create({
      ...dto,
      ownerId: userId,
    });
    return this.deviceGroupRepo.save(group);
  }

  /**
   * Lấy danh sách nhóm thiết bị có phân trang và tìm kiếm
   * Có đính kèm số lượng thiết bị trong nhóm (deviceCount)
   * @param userId ID của người sở hữu
   * @param query Params tìm kiếm và phân trang
   */
  async findAll(
    userId: string,
    query: DeviceGroupQueryDto,
  ): Promise<GetManyBaseResponseDto<DeviceGroup>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const qb = this.deviceGroupRepo.createQueryBuilder('group')
      .where('group.ownerId = :userId', { userId });

    if (search) {
      qb.andWhere('(group.name ILIKE :search OR group.description ILIKE :search)', { search: `%${search}%` });
    }

    // Đếm số lượng thiết bị của mỗi nhóm (Relation count)
    qb.loadRelationCountAndMap('group.deviceCount', 'group.devices');

    if (sortBy) {
      qb.orderBy(`group.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('group.createdAt', 'DESC');
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }

  /**
   * Lấy chi tiết một nhóm thiết bị
   * @param id ID của nhóm
   * @param userId ID của người sở hữu
   */
  async findOne(id: string, userId: string): Promise<DeviceGroup> {
    const group = await this.deviceGroupRepo.createQueryBuilder('group')
      .leftJoinAndSelect('group.devices', 'device')
      .where('group.id = :id', { id })
      .andWhere('group.ownerId = :userId', { userId })
      .loadRelationCountAndMap('group.deviceCount', 'group.devices')
      .getOne();

    if (!group) {
      throw new NotFound('Device group not found', ErrorCode.DEVICE_GROUP_NOT_FOUND);
    }
    return group;
  }

  /**
   * Cập nhật thông tin nhóm thiết bị
   * @param id ID của nhóm
   * @param userId ID của người sở hữu
   * @param dto Dữ liệu cập nhật
   */
  async update(id: string, userId: string, dto: UpdateDeviceGroupDto): Promise<DeviceGroup> {
    const group = await this.findOne(id, userId);
    
    Object.assign(group, dto);
    return this.deviceGroupRepo.save(group);
  }

  /**
   * Xóa một nhóm thiết bị
   * @param id ID của nhóm
   * @param userId ID của người sở hữu
   */
  async remove(id: string, userId: string): Promise<void> {
    const group = await this.findOne(id, userId);
    // Khi xóa group, TypeORM (hoặc DB set null) sẽ đặt deviceGroupId = null cho các device
    await this.deviceGroupRepo.remove(group);
  }

  /**
   * Gán các thiết bị vào nhóm
   * @param id ID của nhóm
   * @param userId ID của người sở hữu
   * @param deviceIds Danh sách ID thiết bị cần gán
   */
  async assignDevices(id: string, userId: string, deviceIds: string[]): Promise<void> {
    // 1. Kiểm tra nhóm có tồn tại và thuộc về user không
    await this.findOne(id, userId);

    // 2. Tìm các thiết bị thuộc về user và nằm trong danh sách truyền lên
    const devices = await this.deviceRepo.find({
      where: {
        id: In(deviceIds),
        ownerId: userId,
      },
    });

    if (devices.length === 0) return;

    // 3. Cập nhật group_id cho các thiết bị này
    for (const device of devices) {
      device.deviceGroupId = id;
    }
    
    await this.deviceRepo.save(devices);
  }

  /**
   * Gỡ các thiết bị khỏi nhóm
   * @param id ID của nhóm
   * @param userId ID của người sở hữu
   * @param deviceIds Danh sách ID thiết bị cần gỡ
   */
  async removeDevices(id: string, userId: string, deviceIds: string[]): Promise<void> {
    // 1. Kiểm tra nhóm có tồn tại
    await this.findOne(id, userId);

    // 2. Tìm các thiết bị thuộc nhóm này và thuộc list ids
    const devices = await this.deviceRepo.find({
      where: {
        id: In(deviceIds),
        deviceGroupId: id,
        ownerId: userId,
      },
    });

    if (devices.length === 0) return;

    // 3. Xóa group_id
    for (const device of devices) {
      device.deviceGroupId = null;
    }

    await this.deviceRepo.save(devices);
  }
}
