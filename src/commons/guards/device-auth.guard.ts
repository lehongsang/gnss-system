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
 * Guard xác thực và phân quyền cho các request HTTP REST đến từ thiết bị IoT.
 * Yêu cầu Basic Auth với username là username MQTT của thiết bị và password là mật khẩu MQTT thô.
 * Đồng thời kiểm tra chặt để thiết bị không thể thao tác hoặc xem dữ liệu thay cho thiết bị khác.
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

    // Gắn thiết bị đã xác thực vào request
    request.device = device;

    // Kiểm tra quyền sở hữu nghiêm ngặt:
    // Nếu body có deviceId thì bắt buộc phải khớp với ID của thiết bị đã xác thực!
    const bodyDeviceId = request.body?.deviceId;
    if (bodyDeviceId && bodyDeviceId !== device.id) {
      throw new UnauthorizedException(
        'Device ID mismatch. You cannot perform operations on behalf of another device.',
      );
    }

    return true;
  }
}
