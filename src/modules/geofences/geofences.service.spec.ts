/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-return */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GeofencesService, GeofenceViolation } from './geofences.service';
import { Geofence } from './entities/geofence.entity';
import {
  GeofenceDeviceState,
  GeofencePresenceState,
} from './entities/geofence-device-state.entity';
import { DevicesService } from '@/modules/devices/devices.service';
import type { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AlertType, GeofenceType } from '@/commons/enums/app.enum';
import type { Device } from '../devices/entities/device.entity';

describe('GeofencesService', () => {
  let service: GeofencesService;
  let geofenceRepo: Repository<Geofence>;
  let stateRepo: Repository<GeofenceDeviceState>;
  let devicesService: DevicesService;

  const mockGeofenceRepository = {
    findOne: jest.fn(),
    create: jest.fn((attrs: any) => attrs),
    save: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
  };

  const mockGeofenceDeviceStateRepository = {
    findOne: jest.fn(),
    create: jest.fn((attrs: any) => attrs),
    save: jest.fn(),
  };

  const mockDevicesService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeofencesService,
        {
          provide: getRepositoryToken(Geofence),
          useValue: mockGeofenceRepository,
        },
        {
          provide: getRepositoryToken(GeofenceDeviceState),
          useValue: mockGeofenceDeviceStateRepository,
        },
        {
          provide: DevicesService,
          useValue: mockDevicesService,
        },
      ],
    }).compile();

    service = module.get<GeofencesService>(GeofencesService);
    geofenceRepo = module.get<Repository<Geofence>>(getRepositoryToken(Geofence));
    stateRepo = module.get<Repository<GeofenceDeviceState>>(getRepositoryToken(GeofenceDeviceState));
    devicesService = module.get<DevicesService>(DevicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateGeofenceTransitions', () => {
    /**
     * Test case: Should detect violation when a device exits an allowed zone
     */
    it('should detect GEOFENCE_EXIT when device exits allowed_zone', async () => {
      const mockRows = [
        {
          id: 'geofence-1',
          name: 'Allowed Zone 1',
          color: '#3b82f6',
          type: GeofenceType.ALLOWED_ZONE,
          created_by: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deleted_at: null,
          is_inside: false, // device is outside the allowed zone -> violation!
        },
      ];

      mockGeofenceRepository.query.mockResolvedValue(mockRows);
      // Previous state: INSIDE (it was safe, now it has exited)
      mockGeofenceDeviceStateRepository.findOne.mockResolvedValue({
        state: GeofencePresenceState.INSIDE,
      });

      // Step-by-step logic: Run evaluation and check that the resulting violation is GEOFENCE_EXIT
      const result = await service.evaluateGeofenceTransitions('device-1', 21.0, 105.8);
      expect(result).toHaveLength(1);
      expect(result[0].alertType).toBe(AlertType.GEOFENCE_EXIT);
      expect(result[0].geofence.id).toBe('geofence-1');
      expect(mockGeofenceDeviceStateRepository.save).toHaveBeenCalled();
    });

    /**
     * Test case: Should detect violation when a device enters a forbidden zone
     */
    it('should detect GEOFENCE_ENTRY when device enters forbidden_zone', async () => {
      const mockRows = [
        {
          id: 'geofence-2',
          name: 'Forbidden Zone 1',
          color: '#ef4444',
          type: GeofenceType.FORBIDDEN_ZONE,
          created_by: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deleted_at: null,
          is_inside: true, // device is inside the forbidden zone -> violation!
        },
      ];

      mockGeofenceRepository.query.mockResolvedValue(mockRows);
      // Previous state: OUTSIDE (it was safe, now it has entered)
      mockGeofenceDeviceStateRepository.findOne.mockResolvedValue({
        state: GeofencePresenceState.OUTSIDE,
      });

      // Step-by-step logic: Run evaluation and expect GEOFENCE_ENTRY violation
      const result = await service.evaluateGeofenceTransitions('device-1', 21.0, 105.8);
      expect(result).toHaveLength(1);
      expect(result[0].alertType).toBe(AlertType.GEOFENCE_ENTRY);
      expect(result[0].geofence.id).toBe('geofence-2');
    });

    /**
     * Test case: Should NOT detect violation when state remains unchanged
     */
    it('should NOT detect violation when device remains in the same state (anti-spam)', async () => {
      const mockRows = [
        {
          id: 'geofence-1',
          name: 'Allowed Zone 1',
          color: '#3b82f6',
          type: GeofenceType.ALLOWED_ZONE,
          created_by: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deleted_at: null,
          is_inside: false, // device is outside the allowed zone (still violating)
        },
      ];

      mockGeofenceRepository.query.mockResolvedValue(mockRows);
      // Previous state: OUTSIDE (it was already violating)
      mockGeofenceDeviceStateRepository.findOne.mockResolvedValue({
        state: GeofencePresenceState.OUTSIDE,
      });

      // Step-by-step logic: Run evaluation and expect no new violation (spam prevention)
      const result = await service.evaluateGeofenceTransitions('device-1', 21.0, 105.8);
      expect(result).toHaveLength(0);
    });

    /**
     * Test case: Should NOT detect violation when device stays inside allowed zone
     */
    it('should NOT detect violation when device stays inside allowed_zone', async () => {
      const mockRows = [
        {
          id: 'geofence-1',
          name: 'Allowed Zone 1',
          color: '#3b82f6',
          type: GeofenceType.ALLOWED_ZONE,
          created_by: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deleted_at: null,
          is_inside: true, // Inside -> safe!
        },
      ];

      mockGeofenceRepository.query.mockResolvedValue(mockRows);
      mockGeofenceDeviceStateRepository.findOne.mockResolvedValue({
        state: GeofencePresenceState.INSIDE,
      });

      // Step-by-step logic: Run evaluation and expect no violations
      const result = await service.evaluateGeofenceTransitions('device-1', 21.0, 105.8);
      expect(result).toHaveLength(0);
    });
  });

  describe('assignDevice', () => {
    /**
     * Test case: Should assign device to geofence
     */
    it('should assign a device to a geofence successfully', async () => {
      const mockGeofence = {
        id: 'geofence-1',
        createdBy: 'user-1',
        devices: [],
      } as unknown as Geofence;

      const mockDevice = {
        id: 'device-1',
        name: 'Device 1',
      } as Device;

      mockGeofenceRepository.findOne.mockResolvedValue(mockGeofence);
      mockDevicesService.findOne.mockResolvedValue(mockDevice);
      mockGeofenceRepository.save.mockResolvedValue(mockGeofence);

      // Step-by-step logic: Call assignDevice and check device array in geofence
      const result = await service.assignDevice('geofence-1', 'device-1');
      expect(result.message).toBe('Device assigned to geofence');
      expect(mockGeofence.devices).toContain(mockDevice);
      expect(mockGeofenceRepository.save).toHaveBeenCalledWith(mockGeofence);
    });
  });

  describe('removeDevice', () => {
    /**
     * Test case: Should remove device from geofence
     */
    it('should remove a device from a geofence successfully', async () => {
      const mockDevice = { id: 'device-1' } as Device;
      const mockGeofence = {
        id: 'geofence-1',
        devices: [mockDevice],
      } as unknown as Geofence;

      mockGeofenceRepository.findOne.mockResolvedValue(mockGeofence);
      mockGeofenceRepository.save.mockResolvedValue(mockGeofence);

      // Step-by-step logic: Call removeDevice and verify device is no longer in array
      const result = await service.removeDevice('geofence-1', 'device-1');
      expect(result.message).toBe('Device removed from geofence');
      expect(mockGeofence.devices).not.toContain(mockDevice);
      expect(mockGeofenceRepository.save).toHaveBeenCalledWith(mockGeofence);
    });
  });

  describe('ownership checks', () => {
    /**
     * Test case: Should throw ForbiddenException when non-admin accesses another user's geofence
     */
    it('should throw ForbiddenException when non-admin deletes someone else geofence', async () => {
      const mockGeofence = {
        id: 'geofence-1',
        createdBy: 'other-user',
      } as Geofence;

      mockGeofenceRepository.findOne.mockResolvedValue(mockGeofence);

      // Step-by-step logic: Call remove with non-admin requester and mismatched owner ID, expect throw
      await expect(
        service.remove('geofence-1', 'user-1', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
