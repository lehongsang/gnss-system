import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Doc } from '@/commons/docs/doc.decorator';
import { DevicesService } from '@/modules/devices/devices.service';
import {
  MqttAclRule,
  MqttAuthRequestDto,
  MqttAuthResponse,
} from './dtos/mqtt-auth.dto';

@Controller('mqtt')
export class MqttAuthController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly configService: ConfigService,
  ) {}

  @Post('auth')
  @AllowAnonymous()
  @HttpCode(HttpStatus.OK)
  @Doc({ summary: 'EMQX HTTP authentication and ACL callback' })
  async authenticate(
    @Body() dto: MqttAuthRequestDto,
  ): Promise<MqttAuthResponse> {
    if (this.isGatewayClient(dto.username, dto.password)) {
      return {
        result: 'allow',
        is_superuser: true,
      };
    }

    const device = await this.devicesService.verifyMqttCredentials(
      dto.username,
      dto.password,
    );
    if (!device) {
      return {
        result: 'deny',
        is_superuser: false,
      };
    }

    return {
      result: 'allow',
      is_superuser: false,
      acl: this.buildDeviceAcl(device.id),
    };
  }

  /**
   * Allows the backend gateway client to bridge device MQTT messages and send commands.
   */
  private isGatewayClient(username: string, password: string): boolean {
    const gatewayUsername = this.configService.get<string>('MQTT_USERNAME');
    const gatewayPassword = this.configService.get<string>('MQTT_PASSWORD');

    return username === gatewayUsername && password === gatewayPassword;
  }

  /**
   * Restricts a device to its own telemetry/media topics and command subscription.
   */
  private buildDeviceAcl(deviceId: string): MqttAclRule[] {
    return [
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/coordinates`,
      },
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/status`,
      },
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/alert`,
      },
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/image`,
      },
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/video`,
      },
      {
        permission: 'allow',
        action: 'publish',
        topic: `gnss/${deviceId}/stream/status`,
      },
      {
        permission: 'allow',
        action: 'subscribe',
        topic: `gnss/${deviceId}/command/#`,
      },
    ];
  }
}
