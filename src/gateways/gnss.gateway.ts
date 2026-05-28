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
 * WebSocket gateway for GNSS realtime data streaming.
 * Secured via WsAuthGuard to ensure only authenticated users
 * can subscribe to device rooms and user-specific alert streams.
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
   * Handles a client subscribing to a specific device's telemetry stream.
   * Leverages WsAuthGuard for authentication, then strictly validates that
   * the authenticated user is the owner or an admin of the requested device.
   *
   * @param client - The connected Socket.IO client
   * @param deviceId - UUID of the device to subscribe to
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
      // Step-by-step logic: Ownership check using DevicesService.findOne
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
   * Handles a client unsubscribing from a device's telemetry stream.
   *
   * @param client - The connected Socket.IO client
   * @param deviceId - UUID of the device to unsubscribe from
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
   * Handles a client joining their personal user room for alert notifications.
   * Validates that users can only join their own room, while admins can join any.
   *
   * @param client - The connected Socket.IO client
   * @param userId - UUID of the authenticated user
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

    // Step-by-step logic: Ensure non-admin users can only join their own room
    if (user.role !== 'admin' && user.id !== userId) {
      throw new WsException('Unauthorized: Access denied');
    }

    await client.join(`user:${userId}`);
    this.logger.log(`User ${user.id} joined user room:${userId}`);
  }

  // Broadcast methods called by consumers

  /**
   * Broadcasts a telemetry update to all clients watching a specific device.
   * Called by TelemetryConsumer after successfully saving a GPS point.
   *
   * @param deviceId - UUID of the device
   * @param data - Telemetry payload with coordinates, speed, and timestamp
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
   * Broadcasts a new alert to the device owner's personal room.
   * Called by AlertsConsumer after successfully creating an alert record.
   *
   * @param deviceOwnerId - UUID of the user who owns the alerting device
   * @param alert - Alert payload with type, message, and location
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
   * Broadcasts a device status change to all clients watching that device.
   * Called by DeviceStatusConsumer after upserting a status record.
   *
   * @param deviceId - UUID of the device
   * @param data - Status payload
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

  // Lifecycle hooks

  /**
   * Handles new connection by logging and performing an early authentication check
   * if a token is supplied during handshake.
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
   * Logs when a client disconnects from the WebSocket gateway.
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`WS Client disconnected: ${client.id}`);
  }

  /**
   * Helper method to extract token from handshake options or headers.
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
