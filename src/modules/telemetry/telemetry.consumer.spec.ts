import { Test } from '@nestjs/testing';
import { TelemetryConsumer } from './telemetry.consumer';
import { KafkaService } from '@/services/kafka/kafka.service';
import { TelemetryService } from './telemetry.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { AlertsService } from '@/modules/alerts/alerts.service';
import { RedisService } from '@/services/redis/redis.service';
import { GeofencesService } from '@/modules/geofences/geofences.service';
import { RouteDeviationService } from '@/modules/route-plans/route-deviation.service';
import type { Device } from '@/modules/devices/entities/device.entity';
import { AlertType } from '@/commons/enums/app.enum';
import type { EachMessageHandler } from 'kafkajs';

describe('TelemetryConsumer', () => {
  let consumer: TelemetryConsumer;
  let handleMessageCallback: EachMessageHandler;

  const mockKafkaService = {
    consume: jest.fn((topic: string, groupId: string, handler: EachMessageHandler) => {
      handleMessageCallback = handler;
    }),
    produce: jest.fn().mockResolvedValue(null),
  };

  const mockTelemetryService = {
    savePoint: jest.fn(),
  };

  const mockGnssGateway = {
    broadcastTelemetry: jest.fn(),
  };

  const mockDevicesService = {
    findOne: jest.fn(),
  };

  const mockAlertsService = {
    create: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    setex: jest.fn(),
  };

  const mockGeofencesService = {
    evaluateGeofenceTransitions: jest.fn(),
  };

  const mockRouteDeviationService = {
    checkDeviation: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TelemetryConsumer,
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: TelemetryService, useValue: mockTelemetryService },
        { provide: GnssGateway, useValue: mockGnssGateway },
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: AlertsService, useValue: mockAlertsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: GeofencesService, useValue: mockGeofencesService },
        { provide: RouteDeviationService, useValue: mockRouteDeviationService },
      ],
    }).compile();

    consumer = module.get<TelemetryConsumer>(TelemetryConsumer);

    // Initialize the consumer so that handleMessageCallback is registered
    await consumer.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessage', () => {
    const mockMessageValue = JSON.stringify({
      correlationId: 'test-correlation-id',
      deviceId: '019e4a45-b4aa-74ed-b5c2-484b89b18701',
      receivedAt: '2026-05-27T10:00:00.000Z',
      retryCount: 0,
      payload: {
        deviceId: '019e4a45-b4aa-74ed-b5c2-484b89b18701',
        lng: 105.8,
        lat: 21.0,
        speed: 95.5,
        heading: 180,
        timestamp: '2026-05-27T10:00:00.000Z',
      },
    });

    const mockMessage = {
      value: Buffer.from(mockMessageValue),
      offset: '0',
    };

    /**
     * Test case: Should parse raw message, call savePoint and broadcast via WS
     */
    it('should parse message, call savePoint and broadcast via WebSocket', async () => {
      mockDevicesService.findOne.mockResolvedValue({ id: '019e4a45-b4aa-74ed-b5c2-484b89b18701', speedLimitKmh: 100 } as Device);
      mockGeofencesService.evaluateGeofenceTransitions.mockResolvedValue([]);

      // Step-by-step logic: Call handleMessage and verify service invocations
      await handleMessageCallback({
        topic: 'gnss.coordinates',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockTelemetryService.savePoint).toHaveBeenCalledWith('019e4a45-b4aa-74ed-b5c2-484b89b18701', {
        lng: 105.8,
        lat: 21.0,
        speed: 95.5,
        heading: 180,
        timestamp: new Date('2026-05-27T10:00:00.000Z'),
        accuracyStatus: 'gnss_only',
      });

      expect(mockGnssGateway.broadcastTelemetry).toHaveBeenCalledWith('019e4a45-b4aa-74ed-b5c2-484b89b18701', {
        lat: 21.0,
        lng: 105.8,
        speed: 95.5,
        heading: 180,
        timestamp: new Date('2026-05-27T10:00:00.000Z'),
      });

      expect(mockRouteDeviationService.checkDeviation).toHaveBeenCalledWith(
        '019e4a45-b4aa-74ed-b5c2-484b89b18701',
        {
          lng: 105.8,
          lat: 21.0,
          speed: 95.5,
          heading: 180,
          timestamp: new Date('2026-05-27T10:00:00.000Z'),
          accuracyStatus: 'gnss_only',
        },
      );
    });

    /**
     * Test case: Should create a SPEEDING alert when speed exceeds limit and cooldown is inactive
     */
    it('should create SPEEDING alert when speed > device limit and cooldown is inactive', async () => {
      mockDevicesService.findOne.mockResolvedValue({ id: '019e4a45-b4aa-74ed-b5c2-484b89b18701', speedLimitKmh: 80 } as Device);
      mockRedisService.get.mockResolvedValue(null); // No cooldown
      mockGeofencesService.evaluateGeofenceTransitions.mockResolvedValue([]);

      // Step-by-step logic: Call handleMessage and check that speeding alert creation is triggered
      await handleMessageCallback({
        topic: 'gnss.coordinates',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.create).toHaveBeenCalledWith({
        deviceId: '019e4a45-b4aa-74ed-b5c2-484b89b18701',
        alertType: AlertType.SPEEDING,
        message: 'Vận tốc 95.5 km/h vượt ngưỡng 80 km/h',
        lat: 21.0,
        lng: 105.8,
      });

      expect(mockRedisService.setex).toHaveBeenCalledWith('speeding:019e4a45-b4aa-74ed-b5c2-484b89b18701', 60, '1');
    });

    /**
     * Test case: Should NOT create a SPEEDING alert when speed exceeds limit but cooldown is active
     */
    it('should NOT create SPEEDING alert when cooldown is active', async () => {
      mockDevicesService.findOne.mockResolvedValue({ id: '019e4a45-b4aa-74ed-b5c2-484b89b18701', speedLimitKmh: 80 } as Device);
      mockRedisService.get.mockResolvedValue('1'); // Cooldown active
      mockGeofencesService.evaluateGeofenceTransitions.mockResolvedValue([]);

      // Step-by-step logic: Call handleMessage and expect alertsService.create not to be called
      await handleMessageCallback({
        topic: 'gnss.coordinates',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should NOT create a SPEEDING alert when speed is within the speed limit
     */
    it('should NOT create SPEEDING alert when speed <= limit', async () => {
      mockDevicesService.findOne.mockResolvedValue({ id: '019e4a45-b4aa-74ed-b5c2-484b89b18701', speedLimitKmh: 100 } as Device);
      mockGeofencesService.evaluateGeofenceTransitions.mockResolvedValue([]);

      // Step-by-step logic: Speed is 95.5, limit is 100. Call handleMessage and expect no alert.
      await handleMessageCallback({
        topic: 'gnss.coordinates',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should NOT create a SPEEDING alert when device has no speed limit
     */
    it('should NOT create SPEEDING alert when device has no limit configured', async () => {
      mockDevicesService.findOne.mockResolvedValue({ id: '019e4a45-b4aa-74ed-b5c2-484b89b18701', speedLimitKmh: null } as Device);
      mockGeofencesService.evaluateGeofenceTransitions.mockResolvedValue([]);

      // Step-by-step logic: Call handleMessage and expect no alert
      await handleMessageCallback({
        topic: 'gnss.coordinates',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should handle JSON parse errors gracefully
     */
    it('should handle JSON parse error gracefully without crashing', async () => {
      const invalidMessage = {
        value: Buffer.from('{invalid-json'),
        offset: '0',
      };

      // Step-by-step logic: Call handleMessage with invalid JSON and expect no throws
      await expect(
        handleMessageCallback({
          topic: 'gnss.coordinates',
          partition: 0,
          message: invalidMessage as any,
          heartbeat: jest.fn(),
          pause: jest.fn().mockImplementation(() => jest.fn()),
        }),
      ).resolves.not.toThrow();

      expect(mockTelemetryService.savePoint).not.toHaveBeenCalled();
    });
  });
});
