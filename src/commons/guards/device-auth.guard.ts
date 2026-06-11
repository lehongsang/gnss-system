import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { DevicesService } from '@/modules/devices/devices.service';
import { Request } from 'express';
import { Device } from '@/modules/devices/entities/device.entity';

interface AuthenticatedDeviceRequest extends Request {
  device?: Device;
  body: {
    deviceId?: string;
  };
}

/**
 * Guard to authenticate and authorize HTTP REST requests originating from IoT devices.
 * Expects HTTP Basic Authentication using the device's MQTT username and plain MQTT password.
 * Also strictly validates that a device cannot manipulate or view data on behalf of another device.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly devicesService: DevicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedDeviceRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header. Basic auth required.',
      );
    }

    const base64Credentials = authHeader.substring(6);
    let decoded: string;
    try {
      decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    } catch {
      throw new UnauthorizedException('Failed to decode Basic auth credentials.');
    }

    const lastColonIndex = decoded.lastIndexOf(':');
    if (lastColonIndex === -1) {
      throw new UnauthorizedException('Invalid Authorization header format.');
    }

    const username = decoded.slice(0, lastColonIndex);
    const password = decoded.slice(lastColonIndex + 1);
    const device = await this.devicesService.verifyMqttCredentials(
      username,
      password,
    );

    if (!device) {
      throw new UnauthorizedException('Invalid device credentials.');
    }

    // Attach verified device to the request
    request.device = device;

    // Strict ownership verification:
    // If the body contains a deviceId, it must match the authenticated device's ID!
    const bodyDeviceId = request.body?.deviceId;
    if (bodyDeviceId && bodyDeviceId !== device.id) {
      throw new UnauthorizedException(
        'Device ID mismatch. You cannot perform operations on behalf of another device.',
      );
    }

    return true;
  }
}
