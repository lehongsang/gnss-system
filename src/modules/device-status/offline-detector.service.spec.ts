import { Test } from '@nestjs/testing';
import { OfflineDetectorService } from './offline-detector.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceStatus } from './entities/device-status.entity';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DeviceStatusEnum } from '@/commons/enums/app.enum';
import { LessThan } from 'typeorm';

describe('OfflineDetectorService', () => {
  let service: OfflineDetectorService;

  const mockDeviceStatusRepository = {
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockGnssGateway = {
    broadcastDeviceStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OfflineDetectorService,
        {
          provide: getRepositoryToken(DeviceStatus),
          useValue: mockDeviceStatusRepository,
        },
        {
          provide: GnssGateway,
          useValue: mockGnssGateway,
        },
      ],
    }).compile();

    service = module.get<OfflineDetectorService>(OfflineDetectorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sweepHeartbeats', () => {
    /**
     * Test case: Should mark online devices inactive for > 5 minutes as OFFLINE
     */
    it('should sweep and mark online devices inactive for > 5 minutes as OFFLINE', async () => {
      const mockInactiveStatus = {
        deviceId: 'device-uuid-1',
        status: DeviceStatusEnum.ONLINE,
        batteryLevel: 50,
        cameraStatus: true,
        gnssStatus: true,
        satellitesTracked: 10,
        signalStrength: 80,
        updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
      } as DeviceStatus;

      mockDeviceStatusRepository.find.mockResolvedValue([mockInactiveStatus]);
      mockDeviceStatusRepository.save.mockResolvedValue({
        ...mockInactiveStatus,
        status: DeviceStatusEnum.OFFLINE,
      });

      // Step-by-step logic: Run the sweeper and verify updates + WebSocket broadcast
      await service.sweepHeartbeats();

      expect(mockDeviceStatusRepository.find).toHaveBeenCalledWith({
        where: {
          status: DeviceStatusEnum.ONLINE,
          updatedAt: LessThan(expect.any(Date)),
        },
      });

      expect(mockInactiveStatus.status).toBe(DeviceStatusEnum.OFFLINE);
      expect(mockDeviceStatusRepository.save).toHaveBeenCalledWith(
        mockInactiveStatus,
      );

      expect(mockGnssGateway.broadcastDeviceStatus).toHaveBeenCalledWith(
        'device-uuid-1',
        {
          status: DeviceStatusEnum.OFFLINE,
          batteryLevel: 50,
          cameraStatus: true,
          gnssStatus: true,
          satellitesTracked: 10,
          signalStrength: 80,
        },
      );
    });

    /**
     * Test case: Should do nothing if no inactive devices are found
     */
    it('should do nothing if no online devices are inactive', async () => {
      mockDeviceStatusRepository.find.mockResolvedValue([]);

      // Step-by-step logic: Run sweep and expect no saves or broadcasts
      await service.sweepHeartbeats();

      expect(mockDeviceStatusRepository.find).toHaveBeenCalled();
      expect(mockDeviceStatusRepository.save).not.toHaveBeenCalled();
      expect(mockGnssGateway.broadcastDeviceStatus).not.toHaveBeenCalled();
    });
  });
});
