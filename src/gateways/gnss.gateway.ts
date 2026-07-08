import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { LoggerService } from '@/commons/logger/logger.service';
import { WsAuthGuard, AuthenticatedSocket } from '@/commons/guards/ws-auth.guard';
import { DevicesService } from '@/modules/devices/devices.service';
import { DataSource } from 'typeorm';
import { Session } from '@/modules/auth/entities/session.entity';

/**
 * Gateway WebSocket phục vụ stream dữ liệu GNSS realtime.
 * Được bảo vệ bởi WsAuthGuard để đảm bảo chỉ user đã xác thực
 * mới có thể subscribe vào room của thiết bị và stream cảnh báo riêng.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: 'gnss',
  transports: ['websocket', 'polling'],
})
export class GnssGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new LoggerService(GnssGateway.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Xử lý khi client subscribe vào stream telemetry của một thiết bị cụ thể.
   * Dựa vào WsAuthGuard để xác thực, sau đó kiểm tra chặt chẽ rằng
   * user đã xác thực phải là chủ sở hữu hoặc admin của thiết bị được yêu cầu.
   *
   * @param client - Socket.IO client đang kết nối
   * @param deviceId - UUID của thiết bị cần subscribe
   */
  @UseGuards(WsAuthGuard)
  @SubscribeMessage('subscribe:device')
  async handleSubscribeDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: string,
  ): Promise<void> {
    const authClient = client as AuthenticatedSocket;
    const user = authClient.data.user;
    if (!user) throw new WsException('Unauthorized');
    const isAdmin = user.role === 'admin';

    try {
      // Kiểm tra quyền sở hữu thông qua DevicesService.findOne
      await this.devicesService.findOne(deviceId, user.id, isAdmin);

      await client.join(`device:${deviceId}`);
      client.emit('subscribed', { deviceId });
      this.logger.log(
        `User ${user.id} (${user.role}) successfully subscribed to device:${deviceId}`,
      );
    } catch {
      throw new WsException('Unauthorized: You do not own this device');
    }
  }

  /**
   * Xử lý khi client hủy subscribe khỏi stream telemetry của thiết bị.
   *
   * @param client - Socket.IO client đang kết nối
   * @param deviceId - UUID của thiết bị cần hủy subscribe
   */
  @SubscribeMessage('unsubscribe:device')
  handleUnsubscribeDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: string,
  ): void {
    void client.leave(`device:${deviceId}`);
    this.logger.log(
      `Client ${client.id} unsubscribed from device:${deviceId}`,
    );
  }

  /**
   * Xử lý khi client join vào room cá nhân để nhận thông báo cảnh báo.
   * Đảm bảo user thường chỉ join được room của chính mình, còn admin thì join room nào cũng được.
   *
   * @param client - Socket.IO client đang kết nối
   * @param userId - UUID của user đã xác thực
   */
  @UseGuards(WsAuthGuard)
  @SubscribeMessage('join:user')
  async handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ): Promise<void> {
    const authClient = client as AuthenticatedSocket;
    const user = authClient.data.user;
    if (!user) throw new WsException('Unauthorized');

    // Đảm bảo user không phải admin chỉ được join room của chính mình
    if (user.role !== 'admin' && user.id !== userId) {
      throw new WsException('Unauthorized: Access denied');
    }

    await client.join(`user:${userId}`);
    this.logger.log(`User ${user.id} joined user room:${userId}`);
  }

  // Các hàm broadcast được gọi từ consumer

  /**
   * Phát telemetry mới nhất tới tất cả client đang theo dõi một thiết bị.
   * Được TelemetryConsumer gọi sau khi lưu thành công một điểm GPS.
   *
   * @param deviceId - UUID của thiết bị
   * @param data - Dữ liệu telemetry gồm tọa độ, tốc độ và timestamp
   */
  broadcastTelemetry(
    deviceId: string,
    data: {
      lat: number;
      lng: number;
      speed: number;
      heading: number;
      timestamp: Date;
    },
  ): void {
    this.server.to(`device:${deviceId}`).emit('telemetry:update', {
      deviceId,
      ...data,
    });
  }

  /**
   * Phát cảnh báo mới tới room cá nhân của chủ sở hữu thiết bị.
   * Được AlertsConsumer gọi sau khi tạo thành công bản ghi alert.
   *
   * @param deviceOwnerId - UUID của user sở hữu thiết bị đang cảnh báo
   * @param alert - Dữ liệu cảnh báo gồm loại, nội dung và vị trí
   */
  broadcastAlert(
    deviceOwnerId: string,
    alert: {
      id: string;
      deviceId: string;
      alertType: string;
      message: string;
      lat: number;
      lng: number;
      snapshotId: string | null;
      snapshotMediaLogId: string | null;
    },
  ): void {
    this.server.to(`user:${deviceOwnerId}`).emit('alert:new', alert);
  }

  /**
   * Phát thay đổi trạng thái thiết bị tới tất cả client đang theo dõi thiết bị đó.
   * Được DeviceStatusConsumer gọi sau khi upsert bản ghi trạng thái.
   *
   * @param deviceId - UUID của thiết bị
   * @param data - Dữ liệu trạng thái
   */
  broadcastDeviceStatus(
    deviceId: string,
    data: {
      status: string;
      batteryLevel: number;
      cameraStatus: boolean;
      gnssStatus: boolean;
      satellitesTracked?: number;
      signalStrength?: number;
    },
  ): void {
    this.server.to(`device:${deviceId}`).emit('device-status:update', {
      deviceId,
      ...data,
    });
  }

  // Các hook vòng đời kết nối

  /**
   * Xử lý khi có kết nối mới: log lại và thử xác thực sớm
   * nếu client gửi kèm token trong lúc handshake.
   */
  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`WS Client connected: ${client.id}`);

    const token = this.extractToken(client);
    if (token) {
      try {
        const session = await this.dataSource.getRepository(Session).findOne({
          where: { token },
          relations: ['user'],
        });

        if (session && session.expiresAt > new Date()) {
          const authClient = client as AuthenticatedSocket;
          authClient.data = {
            ...authClient.data,
            user: {
              id: session.user.id,
              role: session.user.role,
              email: session.user.email,
            },
          };
          this.logger.log(
            `WS Client early-authenticated: ${session.user.email} (${client.id})`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Early WS auth warning for client ${client.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Log lại khi client ngắt kết nối khỏi gateway WebSocket.
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`WS Client disconnected: ${client.id}`);
  }

  /**
   * Hàm hỗ trợ lấy token từ handshake auth hoặc headers.
   */
  private extractToken(client: Socket): string | null {
    const authHeader: unknown =
      client.handshake.auth?.token || client.handshake.headers?.authorization;

    if (typeof authHeader !== 'string') {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }
}
