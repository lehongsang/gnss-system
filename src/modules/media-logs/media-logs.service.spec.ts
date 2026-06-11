import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MediaLogsService } from './media-logs.service';
import { MediaLog } from './entities/media-log.entity';
import { DevicesService } from '@/modules/devices/devices.service';
import { StorageService } from '@/services/storage/storage.service';
import { AlertsService } from '@/modules/alerts/alerts.service';
import { ConfirmMediaType } from './dtos/confirm-upload.dto';
import { MediaType } from './entities/media-log.entity';
import { KafkaService } from '@/services/kafka/kafka.service';

describe('MediaLogsService', () => {
  let service: MediaLogsService;

  const mockMediaLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDevicesService = {
    findOneById: jest.fn(),
  };

  const mockStorageService = {
    getObjectMetadata: jest.fn(),
  };

  const mockAlertsService = {
    linkSnapshotMedia: jest.fn(),
  };

  const mockKafkaService = {
    produce: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MediaLogsService,
        {
          provide: getRepositoryToken(MediaLog),
          useValue: mockMediaLogRepository,
        },
        {
          provide: DevicesService,
          useValue: mockDevicesService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: AlertsService,
          useValue: mockAlertsService,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
      ],
    }).compile();

    service = module.get<MediaLogsService>(MediaLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('confirmUpload with coordinates', () => {
    it('should save coordinates directly if provided in the DTO', async () => {
      const dto = {
        deviceId: 'device-uuid',
        s3Key: 'media-logs/device-uuid/file.jpg',
        mediaType: ConfirmMediaType.IMAGE,
        lat: 10.5,
        lng: 106.3,
      };

      mockDevicesService.findOneById.mockResolvedValue({});
      mockStorageService.getObjectMetadata.mockResolvedValue({ size: 1024 });
      
      const expectedLog = {
        id: 'log-uuid',
        deviceId: dto.deviceId,
        mediaType: MediaType.IMAGE_FRAME,
        lat: 10.5,
        lng: 106.3,
      } as MediaLog;

      mockMediaLogRepository.create.mockReturnValue(expectedLog);
      mockMediaLogRepository.save.mockResolvedValue(expectedLog);

      const result = await service.confirmUpload(dto);

      expect(result).toBe(expectedLog);
      expect(mockMediaLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 10.5,
          lng: 106.3,
        }),
      );
      expect(mockMediaLogRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media_logs SET geom'),
        [106.3, 10.5, 'log-uuid'],
      );
    });

    it('should fall back to closest telemetry coordinates if not provided in DTO', async () => {
      const dto = {
        deviceId: 'device-uuid',
        s3Key: 'media-logs/device-uuid/file.jpg',
        mediaType: ConfirmMediaType.IMAGE,
      };

      mockDevicesService.findOneById.mockResolvedValue({});
      mockStorageService.getObjectMetadata.mockResolvedValue({ size: 1024 });

      // Mock findClosestTelemetry queries (before and after)
      mockMediaLogRepository.query.mockImplementation(async (sql: string) => {
        await Promise.resolve();
        if (sql.includes('timestamp <= $2')) {
          // recordBefore
          return [{ lat: 10.1, lng: 106.1, timestamp: new Date(Date.now() - 5000).toISOString() }];
        }
        if (sql.includes('timestamp > $2')) {
          // recordAfter
          return [{ lat: 10.2, lng: 106.2, timestamp: new Date(Date.now() + 10000).toISOString() }];
        }
        // ST_SetSRID update query
        return [];
      });

      const expectedLog = {
        id: 'log-uuid',
        deviceId: dto.deviceId,
        mediaType: MediaType.IMAGE_FRAME,
      } as MediaLog;

      mockMediaLogRepository.create.mockReturnValue(expectedLog);
      mockMediaLogRepository.save.mockResolvedValue(expectedLog);

      await service.confirmUpload(dto);

      // Verify that it selected the recordBefore because the difference (5s) is smaller than recordAfter (10s)
      expect(mockMediaLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 10.1,
          lng: 106.1,
        }),
      );
    });
  });

  describe('findMapPins', () => {
    it('should query only geotagged logs and handle ownership filters', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockMediaLogRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const query = { deviceId: 'device-uuid', from: '2026-01-01', to: '2026-01-02' };
      await service.findMapPins(query, 'user-uuid', false);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('mediaLog.lat IS NOT NULL');
      expect(mockQueryBuilder.innerJoin).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mediaLog.deviceId = :deviceId', { deviceId: 'device-uuid' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mediaLog.startTime >= :from', { from: '2026-01-01' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('mediaLog.startTime <= :to', { to: '2026-01-02' });
    });
  });
});
