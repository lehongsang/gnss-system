/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DevicesService } from './devices.service';
import { Device } from './entities/device.entity';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

describe('DevicesService', () => {
  let service: DevicesService;
  let repo: Repository<Device>;

  const mockDeviceRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DevicesService,
        {
          provide: getRepositoryToken(Device),
          useValue: mockDeviceRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    repo = module.get<Repository<Device>>(getRepositoryToken(Device));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    /**
     * Test case: Should return device when the requester is the owner
     */
    it('should return device when the requester is the owner', async () => {
      const mockDevice = { id: 'device-id-1', ownerId: 'user-id-1' } as Device;
      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Call findOne and verify ownership check succeeds
      const result = await service.findOne('device-id-1', 'user-id-1', false);
      expect(result).toBe(mockDevice);
      expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'device-id-1' },
        relations: ['owner'],
      });
    });

    /**
     * Test case: Should throw ForbiddenException when non-admin accesses device of another user
     */
    it('should throw ForbiddenException when non-admin accesses device of another user', async () => {
      const mockDevice = { id: 'device-id-1', ownerId: 'other-user-id' } as Device;
      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Expect exception to be thrown for mismatched owner ID and non-admin requester
      await expect(
        service.findOne('device-id-1', 'user-id-1', false),
      ).rejects.toThrow(ForbiddenException);
    });

    /**
     * Test case: Should return device when requester is admin even if not the owner
     */
    it('should return device when requester is admin even if not the owner', async () => {
      const mockDevice = { id: 'device-id-1', ownerId: 'other-user-id' } as Device;
      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Call findOne with isAdmin = true and verify it returns successfully
      const result = await service.findOne('device-id-1', 'user-id-1', true);
      expect(result).toBe(mockDevice);
    });

    /**
     * Test case: Should throw NotFoundException when device does not exist
     */
    it('should throw NotFoundException when device does not exist', async () => {
      mockDeviceRepository.findOne.mockResolvedValue(null);

      // Step-by-step logic: Verify NotFoundException is thrown when repository findOne returns null
      await expect(
        service.findOne('device-id-1', 'user-id-1', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    /**
     * Test case: Should create device, assign owner, and generate MQTT credentials
     */
    it('should create device and generate MQTT credentials', async () => {
      const createDto = { name: 'Test Device', ownerId: 'user-id-1' };
      const createdDevice = { id: 'device-id-1', name: 'Test Device', ownerId: 'user-id-1' } as Device;

      mockDeviceRepository.create.mockReturnValue(createdDevice);
      mockDeviceRepository.save.mockResolvedValue(createdDevice);
      mockDeviceRepository.update.mockResolvedValue({});
      mockDeviceRepository.findOne.mockResolvedValue(createdDevice);

      // Step-by-step logic: Run creation flow and verify MQTT config properties
      const result = await service.create(createDto, 'user-id-1');
      expect(result.device).toBe(createdDevice);
      expect(result.mqttCredentials).toBeDefined();
      expect(result.mqttCredentials.deviceId).toBe('device-id-1');
      expect(result.mqttCredentials.mqttUsername).toBe('device:device-id-1');
      expect(result.mqttCredentials.mqttPassword).toBeDefined();
      expect(mockDeviceRepository.create).toHaveBeenCalled();
      expect(mockDeviceRepository.save).toHaveBeenCalled();
      expect(mockDeviceRepository.update).toHaveBeenCalled();
    });
  });

  describe('regenerateMqttCredentials', () => {
    /**
     * Test case: Should reissue MQTT credentials and invalidate previous password
     */
    it('should regenerate MQTT credentials', async () => {
      const mockDevice = { id: 'device-id-1', ownerId: 'user-id-1', mqttUsername: 'device:device-id-1' } as Device;
      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);
      mockDeviceRepository.update.mockResolvedValue({});

      // Step-by-step logic: Run regeneration and verify output containing new credentials
      const result = await service.regenerateMqttCredentials('device-id-1', 'user-id-1', false);
      expect(result.device).toBe(mockDevice);
      expect(result.mqttCredentials).toBeDefined();
      expect(result.mqttCredentials.mqttUsername).toBe('device:device-id-1');
      expect(mockDeviceRepository.update).toHaveBeenCalled();
    });
  });

  describe('verifyMqttCredentials', () => {
    /**
     * Test case: Should return device when credentials are valid
     */
    it('should return device when credentials are valid', async () => {
      const password = 'plain-password';
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash(password, salt);
      const mockDevice = {
        id: 'device-id-1',
        mqttUsername: 'device:device-id-1',
        mqttPasswordHash: hash,
      } as Device;

      // Mock query builder because findByMqttUsernameWithSecret uses custom query builder with addSelect
      const mockQueryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockDevice),
      };
      mockDeviceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Step-by-step logic: Verify credentials and check that returned object is correct
      const result = await service.verifyMqttCredentials('device:device-id-1', password);
      expect(result).toBe(mockDevice);
    });

    /**
     * Test case: Should return null when password is incorrect
     */
    it('should return null when password is incorrect', async () => {
      const mockDevice = {
        id: 'device-id-1',
        mqttUsername: 'device:device-id-1',
        mqttPasswordHash: 'some-other-hash',
      } as Device;

      const mockQueryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockDevice),
      };
      mockDeviceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Step-by-step logic: Verify incorrect credentials and expect null
      const result = await service.verifyMqttCredentials('device:device-id-1', 'wrong-password');
      expect(result).toBeNull();
    });

    /**
     * Test case: Should return null when device does not exist
     */
    it('should return null when device does not exist', async () => {
      const mockQueryBuilder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockDeviceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Step-by-step logic: Call verify credentials and expect null
      const result = await service.verifyMqttCredentials('device:device-id-1', 'password');
      expect(result).toBeNull();
    });
  });
});
