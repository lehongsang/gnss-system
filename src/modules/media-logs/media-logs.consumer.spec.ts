/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { Test } from '@nestjs/testing';
import { MediaLogsConsumer } from './media-logs.consumer';
import { KafkaService } from '@/services/kafka/kafka.service';
import { StorageService } from '@/services/storage/storage.service';
import { MediaLogsService } from './media-logs.service';
import { AlertsService } from '@/modules/alerts/alerts.service';
import type { EachMessageHandler } from 'kafkajs';
import { KafkaTopic } from '@/services/kafka/kafka.enum';
import { MediaType } from './entities/media-log.entity';

describe('MediaLogsConsumer', () => {
  let consumer: MediaLogsConsumer;
  let kafkaService: KafkaService;
  let storageService: StorageService;
  let mediaLogsService: MediaLogsService;
  let alertsService: AlertsService;
  let handleMessageCallback: EachMessageHandler;

  const mockKafkaService = {
    consume: jest.fn(async (topic: string, groupId: string, handler: EachMessageHandler) => {
      handleMessageCallback = handler;
    }),
    produce: jest.fn().mockResolvedValue(null),
  };

  const mockStorageService = {
    uploadRawFile: jest.fn(),
  };

  const mockMediaLogsService = {
    create: jest.fn(),
  };

  const mockAlertsService = {
    linkSnapshotMedia: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MediaLogsConsumer,
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: MediaLogsService, useValue: mockMediaLogsService },
        { provide: AlertsService, useValue: mockAlertsService },
      ],
    }).compile();

    consumer = module.get<MediaLogsConsumer>(MediaLogsConsumer);
    kafkaService = module.get<KafkaService>(KafkaService);
    storageService = module.get<StorageService>(StorageService);
    mediaLogsService = module.get<MediaLogsService>(MediaLogsService);
    alertsService = module.get<AlertsService>(AlertsService);

    // Initialize to register handler callback
    await consumer.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessage', () => {
    const mockImagePayload = {
      deviceId: 'device-id-abc',
      mediaType: 'image',
      data: Buffer.from('fake-image-bytes').toString('base64'),
      mimeType: 'image/jpeg',
      timestamp: '2026-05-27T10:00:00.000Z',
      snapshotId: 'snap-123',
    };

    const mockEnvelope = {
      correlationId: 'correlation-id-123',
      deviceId: 'device-id-abc',
      receivedAt: '2026-05-27T10:01:00.000Z',
      retryCount: 0,
      payload: mockImagePayload,
    };

    const mockMessage = {
      value: Buffer.from(JSON.stringify(mockEnvelope)),
      offset: '10',
    };

    it('should successfully parse enveloped base64 image, upload to S3, persist in DB, and link to alert', async () => {
      mockStorageService.uploadRawFile.mockResolvedValue('s3/key/path/image.jpg');
      mockMediaLogsService.create.mockResolvedValue({ id: 'saved-media-log-id' });

      await handleMessageCallback({
        topic: 'gnss.media.upload',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      // Verify S3 upload invocation
      expect(mockStorageService.uploadRawFile).toHaveBeenCalledWith(
        Buffer.from('fake-image-bytes'),
        'image/jpeg',
        'media-logs/device-id-abc',
        expect.stringContaining('device-id-abc.jpg'),
      );

      // Verify DB persistence
      expect(mockMediaLogsService.create).toHaveBeenCalledWith({
        deviceId: 'device-id-abc',
        mediaType: MediaType.IMAGE_FRAME,
        startTime: new Date('2026-05-27T10:00:00.000Z'),
        endTime: new Date('2026-05-27T10:00:00.000Z'),
        s3Key: 's3/key/path/image.jpg',
        fileUrl: '',
        snapshotId: 'snap-123',
      });

      // Verify link snapshot call
      expect(mockAlertsService.linkSnapshotMedia).toHaveBeenCalledWith(
        'device-id-abc',
        'snap-123',
        'saved-media-log-id',
      );
    });

    it('should successfully parse enveloped base64 video and map to VIDEO_CHUNK', async () => {
      const mockVideoPayload = {
        deviceId: 'device-id-abc',
        mediaType: 'video',
        data: Buffer.from('fake-video-bytes').toString('base64'),
        mimeType: 'video/mp4',
        timestamp: '2026-05-27T10:00:00.000Z',
      };

      const mockVideoEnvelope = {
        correlationId: 'correlation-id-789',
        deviceId: 'device-id-abc',
        receivedAt: '2026-05-27T10:01:00.000Z',
        retryCount: 0,
        payload: mockVideoPayload,
      };

      const mockVideoMessage = {
        value: Buffer.from(JSON.stringify(mockVideoEnvelope)),
        offset: '11',
      };

      mockStorageService.uploadRawFile.mockResolvedValue('s3/key/path/video.mp4');
      mockMediaLogsService.create.mockResolvedValue({ id: 'saved-video-log-id' });

      await handleMessageCallback({
        topic: 'gnss.media.upload',
        partition: 0,
        message: mockVideoMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockStorageService.uploadRawFile).toHaveBeenCalledWith(
        Buffer.from('fake-video-bytes'),
        'video/mp4',
        'media-logs/device-id-abc',
        expect.stringContaining('device-id-abc.mp4'),
      );

      expect(mockMediaLogsService.create).toHaveBeenCalledWith({
        deviceId: 'device-id-abc',
        mediaType: MediaType.VIDEO_CHUNK,
        startTime: new Date('2026-05-27T10:00:00.000Z'),
        endTime: new Date('2026-05-27T10:00:00.000Z'),
        s3Key: 's3/key/path/video.mp4',
        fileUrl: '',
        snapshotId: null,
      });

      expect(mockAlertsService.linkSnapshotMedia).not.toHaveBeenCalled();
    });

    it('should catch errors gracefully and forward original raw payload to DLQ topic', async () => {
      // Simulate storage failure
      mockStorageService.uploadRawFile.mockRejectedValue(new Error('S3 connection timeout'));

      await handleMessageCallback({
        topic: 'gnss.media.upload',
        partition: 0,
        message: mockMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      // Verify that create and link calls are bypassed
      expect(mockMediaLogsService.create).not.toHaveBeenCalled();

      // Verify failure redirection to DLQ
      expect(mockKafkaService.produce).toHaveBeenCalledWith(
        KafkaTopic.GNSS_MEDIA_UPLOAD_DLQ,
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.stringContaining('S3 connection timeout'),
          }),
        ]),
      );
    });

    it('should catch envelope parsing failures and forward raw message to DLQ', async () => {
      const invalidMessage = {
        value: Buffer.from('invalid-json-content'),
        offset: '12',
      };

      await handleMessageCallback({
        topic: 'gnss.media.upload',
        partition: 0,
        message: invalidMessage as any,
        heartbeat: jest.fn(),
        pause: jest.fn().mockImplementation(() => jest.fn()),
      });

      expect(mockStorageService.uploadRawFile).not.toHaveBeenCalled();

      expect(mockKafkaService.produce).toHaveBeenCalledWith(
        KafkaTopic.GNSS_MEDIA_UPLOAD_DLQ,
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.stringContaining('invalid-json-content'),
          }),
        ]),
      );
    });
  });
});
