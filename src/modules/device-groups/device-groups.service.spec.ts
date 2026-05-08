import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceGroupsService } from './device-groups.service';
import { DeviceGroup } from './entities/device-group.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { NotFound } from '@/commons/exceptions';
import type { Repository } from 'typeorm';

describe('DeviceGroupsService', () => {
  let service: DeviceGroupsService;
  let deviceGroupRepo: Repository<DeviceGroup>;
  let deviceRepo: Repository<Device>;

  const mockDeviceGroupRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    remove: jest.fn(),
  };

  const mockDeviceRepo = {
    find: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceGroupsService,
        {
          provide: getRepositoryToken(DeviceGroup),
          useValue: mockDeviceGroupRepo,
        },
        {
          provide: getRepositoryToken(Device),
          useValue: mockDeviceRepo,
        },
      ],
    }).compile();

    service = module.get<DeviceGroupsService>(DeviceGroupsService);
    deviceGroupRepo = module.get<Repository<DeviceGroup>>(getRepositoryToken(DeviceGroup));
    deviceRepo = module.get<Repository<Device>>(getRepositoryToken(Device));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new device group', async () => {
      const dto = { name: 'Test Group', description: 'Test desc' };
      const userId = 'user-123';
      const expectedGroup = { id: 'group-1', ...dto, ownerId: userId };

      mockDeviceGroupRepo.create.mockReturnValue(expectedGroup);
      mockDeviceGroupRepo.save.mockResolvedValue(expectedGroup);

      const result = await service.create(userId, dto);
      
      expect(mockDeviceGroupRepo.create).toHaveBeenCalledWith({ ...dto, ownerId: userId });
      expect(mockDeviceGroupRepo.save).toHaveBeenCalledWith(expectedGroup);
      expect(result).toEqual(expectedGroup);
    });
  });

  describe('findOne', () => {
    it('should throw NotFound if group not found', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockDeviceGroupRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.findOne('invalid-id', 'user-id')).rejects.toThrow(NotFound);
    });
  });
});
