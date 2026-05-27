jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => jest.fn(),
  Roles: () => jest.fn(),
  Session: () => jest.fn(),
  ActiveUser: () => jest.fn(),
}));

jest.mock('better-auth', () => ({
  betterAuth: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { MqttAuthController } from './mqtt-auth.controller';
import { DevicesService } from '@/modules/devices/devices.service';
import { ConfigService } from '@nestjs/config';
import type { MqttAuthRequestDto } from './dtos/mqtt-auth.dto';
import type { Device } from '@/modules/devices/entities/device.entity';

describe('MqttAuthController', () => {
  let controller: MqttAuthController;

  const mockDevicesService = {
    verifyMqttCredentials: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'MQTT_USERNAME') return 'gateway-user';
      if (key === 'MQTT_PASSWORD') return 'gateway-pass';
      return null;
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MqttAuthController],
      providers: [
        {
          provide: DevicesService,
          useValue: mockDevicesService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<MqttAuthController>(MqttAuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    /**
     * Test case: Should return allow + is_superuser=true for gateway client credentials
     */
    it('should return allow + is_superuser=true for gateway client credentials', async () => {
      const dto: MqttAuthRequestDto = {
        username: 'gateway-user',
        password: 'gateway-pass',
        clientid: 'gateway-client',
      };

      // Step-by-step logic: Call authenticate and verify superuser privileges
      const result = await controller.authenticate(dto);
      expect(result).toEqual({
        result: 'allow',
        is_superuser: true,
      });
      expect(mockDevicesService.verifyMqttCredentials).not.toHaveBeenCalled();
    });

    /**
     * Test case: Should return deny when username/password is incorrect and not gateway client
     */
    it('should return deny when username/password is incorrect', async () => {
      const dto: MqttAuthRequestDto = {
        username: 'device:123',
        password: 'wrong-password',
        clientid: 'device-client-123',
      };

      mockDevicesService.verifyMqttCredentials.mockResolvedValue(null);

      // Step-by-step logic: Call authenticate with invalid device credentials and expect deny
      const result = await controller.authenticate(dto);
      expect(result).toEqual({
        result: 'deny',
        is_superuser: false,
      });
      expect(mockDevicesService.verifyMqttCredentials).toHaveBeenCalledWith(
        'device:123',
        'wrong-password',
      );
    });

    /**
     * Test case: Should return allow + ACL when device credentials are correct
     */
    it('should return allow + ACL when device credentials are correct', async () => {
      const dto: MqttAuthRequestDto = {
        username: 'device:device-id-1',
        password: 'correct-password',
        clientid: 'device-client-1',
      };

      const mockDevice = {
        id: 'device-id-1',
        mqttUsername: 'device:device-id-1',
      } as Device;

      mockDevicesService.verifyMqttCredentials.mockResolvedValue(mockDevice);

      // Step-by-step logic: Call authenticate and verify that the ACL maps correctly to the device ID
      const result = await controller.authenticate(dto);
      expect(result.result).toBe('allow');
      expect(result.is_superuser).toBe(false);
      expect(result.acl).toBeDefined();
      expect(result.acl).toHaveLength(7);

      // ACL verification: Publish actions only allow this device's telemetry/media topics
      const publishActions = result.acl?.filter((rule) => rule.action === 'publish');
      expect(publishActions).toBeDefined();
      publishActions?.forEach((rule) => {
        expect(rule.permission).toBe('allow');
        expect(rule.topic).toContain('device-id-1');
      });

      // ACL verification: Subscribe action allows command topics for this device
      const subscribeActions = result.acl?.filter((rule) => rule.action === 'subscribe');
      expect(subscribeActions).toBeDefined();
      expect(subscribeActions?.[0]).toEqual({
        permission: 'allow',
        action: 'subscribe',
        topic: 'gnss/device-id-1/command/#',
      });
    });
  });
});
