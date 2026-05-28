/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { Test } from '@nestjs/testing';
import { AlertsConsumer } from './alerts.consumer';
import { KafkaService } from '@/services/kafka/kafka.service';
import { AlertsService } from './alerts.service';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { DevicesService } from '@/modules/devices/devices.service';
import { MailService } from '@/services/mail/mail.service';
import type { Alert } from './entities/alert.entity';
import type { Device } from '@/modules/devices/entities/device.entity';
import { AlertType } from '@/commons/enums/app.enum';
import type { EachMessageHandler } from 'kafkajs';
import type { MediaLog } from '../media-logs/entities/media-log.entity';

describe('AlertsConsumer', () => {
  let consumer: AlertsConsumer;
  let kafkaService: KafkaService;
  let alertsService: AlertsService;
  let gnssGateway: GnssGateway;
  let devicesService: DevicesService;
  let mailService: MailService;
  let handleMessageCallback: EachMessageHandler;

  const mockKafkaService = {
    consume: jest.fn(async (topic: string, groupId: string, handler: EachMessageHandler) => {
      handleMessageCallback = handler;
    }),
    produce: jest.fn().mockResolvedValue(null),
  };

  const mockAlertsService = {
    findSnapshotMediaLog: jest.fn(),
    create: jest.fn(),
  };

  const mockGnssGateway = {
    broadcastAlert: jest.fn(),
  };

  const mockDevicesService = {
    findOne: jest.fn(),
  };

  const mockMailService = {
    sendAlertEmail: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AlertsConsumer,
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: AlertsService, useValue: mockAlertsService },
        { provide: GnssGateway, useValue: mockGnssGateway },
        { provide: DevicesService, useValue: mockDevicesService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    consumer = module.get<AlertsConsumer>(AlertsConsumer);
    kafkaService = module.get<KafkaService>(KafkaService);
    alertsService = module.get<AlertsService>(AlertsService);
    gnssGateway = module.get<GnssGateway>(GnssGateway);
    devicesService = module.get<DevicesService>(DevicesService);
    mailService = module.get<MailService>(MailService);

    // Initialize the consumer
    await consumer.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessage', () => {
    const mockPayload = {
      deviceId: 'device-id-123',
      type: AlertType.GEOFENCE_EXIT,
      severity: 'CRITICAL',
      message: 'Device left allowed region',
      location: { lat: 21.0, lng: 105.8 },
      timestamp: '2026-05-27T10:00:00.000Z',
      snapshotId: 'snap-123',
    };

    const mockEnvelope = {
      correlationId: 'test-correlation-id',
      deviceId: 'device-id-123',
      receivedAt: '2026-05-27T10:00:00.000Z',
      retryCount: 0,
      payload: mockPayload,
    };

    const mockMessage = {
      value: Buffer.from(JSON.stringify(mockEnvelope)),
      offset: '0',
    };

    /**
     * Test case: Should parse raw message, link snapshot media log, persist, broadcast, and send email
     */
    it('should parse message, link media log, save alert, broadcast via WS and send critical email', async () => {
      const mockMediaLog = { id: 'media-log-id' } as MediaLog;
      const mockAlert = {
        id: 'alert-id',
        alertType: AlertType.GEOFENCE_EXIT,
        message: 'Device left allowed region',
        lat: 21.0,
        lng: 105.8,
        snapshotId: 'snap-123',
        snapshotMediaLogId: 'media-log-id',
      } as Alert;

      const mockOwner = { email: 'owner@example.com' };
      const mockDevice = {
        id: 'device-id-123',
        name: 'Device 1',
        ownerId: 'owner-id',
        owner: mockOwner,
      } as unknown as Device;

      mockAlertsService.findSnapshotMediaLog.mockResolvedValue(mockMediaLog);
      mockAlertsService.create.mockResolvedValue(mockAlert);
      mockDevicesService.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Run alert message handler and verify coordinates/owner fields are propagated
      await handleMessageCallback({
        topic: 'gnss.alerts',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.findSnapshotMediaLog).toHaveBeenCalledWith('device-id-123', 'snap-123');
      expect(mockAlertsService.create).toHaveBeenCalledWith({
        deviceId: 'device-id-123',
        alertType: AlertType.GEOFENCE_EXIT,
        message: 'Device left allowed region',
        lat: 21.0,
        lng: 105.8,
        snapshotId: 'snap-123',
        snapshotMediaLogId: 'media-log-id',
      });

      expect(mockGnssGateway.broadcastAlert).toHaveBeenCalledWith('owner-id', {
        id: 'alert-id',
        deviceId: 'device-id-123',
        alertType: AlertType.GEOFENCE_EXIT,
        message: 'Device left allowed region',
        lat: 21.0,
        lng: 105.8,
        snapshotId: 'snap-123',
        snapshotMediaLogId: 'media-log-id',
      });

      expect(mockMailService.sendAlertEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'Thiết bị thoát khỏi vùng địa lý',
        'Thiết bị "Device 1": Device left allowed region',
      );
    });

    /**
     * Test case: Should NOT send email if severity is low (e.g. INFO)
     */
    it('should NOT send email if severity is low (e.g. INFO)', async () => {
      const lowSeverityPayload = {
        ...mockPayload,
        severity: 'INFO',
      };
      const lowSeverityEnvelope = {
        correlationId: 'test-correlation-id',
        deviceId: 'device-id-123',
        receivedAt: '2026-05-27T10:00:00.000Z',
        retryCount: 0,
        payload: lowSeverityPayload,
      };
      const lowSeverityMessage = {
        value: Buffer.from(JSON.stringify(lowSeverityEnvelope)),
        offset: '0',
      };

      const mockAlert = {
        id: 'alert-id',
        alertType: AlertType.GEOFENCE_EXIT,
        message: 'Device left allowed region',
        lat: 21.0,
        lng: 105.8,
      } as Alert;

      const mockDevice = {
        id: 'device-id-123',
        name: 'Device 1',
        ownerId: 'owner-id',
        owner: { email: 'owner@example.com' },
      } as unknown as Device;

      mockAlertsService.create.mockResolvedValue(mockAlert);
      mockDevicesService.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Run alert handler with low severity, expect no email
      await handleMessageCallback({
        topic: 'gnss.alerts',
        partition: 0,
        message: lowSeverityMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockMailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should NOT send email if alertType is not critical (e.g. SPEEDING)
     */
    it('should NOT send email if alert type is not critical (e.g. SPEEDING)', async () => {
      const speedingPayload = {
        ...mockPayload,
        type: AlertType.SPEEDING,
      };
      const speedingEnvelope = {
        correlationId: 'test-correlation-id',
        deviceId: 'device-id-123',
        receivedAt: '2026-05-27T10:00:00.000Z',
        retryCount: 0,
        payload: speedingPayload,
      };
      const speedingMessage = {
        value: Buffer.from(JSON.stringify(speedingEnvelope)),
        offset: '0',
      };

      const mockAlert = {
        id: 'alert-id',
        alertType: AlertType.SPEEDING,
        message: 'Speed limit exceeded',
        lat: 21.0,
        lng: 105.8,
      } as Alert;

      const mockDevice = {
        id: 'device-id-123',
        name: 'Device 1',
        ownerId: 'owner-id',
        owner: { email: 'owner@example.com' },
      } as unknown as Device;

      mockAlertsService.create.mockResolvedValue(mockAlert);
      mockDevicesService.findOne.mockResolvedValue(mockDevice);

      // Step-by-step logic: Run handler with non-critical alert type (SPEEDING) and expect no email
      await handleMessageCallback({
        topic: 'gnss.alerts',
        partition: 0,
        message: speedingMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockMailService.sendAlertEmail).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should skip message if alert type is unknown / invalid
     */
    it('should skip message if alert type is not in enum', async () => {
      const invalidPayload = {
        ...mockPayload,
        type: 'UNKNOWN_ALERT_TYPE',
      };
      const invalidEnvelope = {
        correlationId: 'test-correlation-id',
        deviceId: 'device-id-123',
        receivedAt: '2026-05-27T10:00:00.000Z',
        retryCount: 0,
        payload: invalidPayload,
      };
      const invalidMessage = {
        value: Buffer.from(JSON.stringify(invalidEnvelope)),
        offset: '0',
      };

      // Step-by-step logic: Execute handler with invalid alert type, expect immediate return
      await handleMessageCallback({
        topic: 'gnss.alerts',
        partition: 0,
        message: invalidMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should handle JSON parse error gracefully
     */
    it('should handle JSON parse error gracefully', async () => {
      const malformedMessage = {
        value: Buffer.from('{malformed'),
        offset: '0',
      };

      // Step-by-step logic: Execute handler with malformed JSON, expect no crash
      await expect(
        handleMessageCallback({
          topic: 'gnss.alerts',
          partition: 0,
          message: malformedMessage as any,
          heartbeat: jest.fn(),
          pause: jest.fn().mockImplementation(() => jest.fn()),
        }),
      ).resolves.not.toThrow();

      expect(mockAlertsService.create).not.toHaveBeenCalled();
    });
  });
});
