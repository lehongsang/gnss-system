import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LoggerService } from '@/commons/logger/logger.service';

/**
 * WebSocket gateway for GNSS realtime data streaming.
 *
 * Provides room-based broadcasting for two types of events:
 * - `telemetry:update` — GPS coordinate updates pushed to `device:{deviceId}` rooms
 * - `alert:new` — Device alerts pushed to `user:{userId}` rooms
 *
 * Clients subscribe to specific devices or their user room to receive
 * targeted, low-latency updates instead of polling REST endpoints.
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: 'gnss',
  transports: ['websocket', 'polling'],
})
export class GnssGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new LoggerService(GnssGateway.name);

  /**
   * Handles a client subscribing to a specific device's telemetry stream.
   * The client joins the Socket.IO room `device:{deviceId}` and will receive
   * all subsequent `telemetry:update` events for that device.
   *
   * @param client - The connected Socket.IO client
   * @param deviceId - UUID of the device to subscribe to
   */
  @SubscribeMessage('subscribe:device')
  handleSubscribeDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: string,
  ): void {
    void client.join(`device:${deviceId}`);
    client.emit('subscribed', { deviceId });
    this.logger.log(
      `Client ${client.id} subscribed to device:${deviceId}`,
    );
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
   * The client joins `user:{userId}` and will receive `alert:new` events
   * for all devices they own.
   *
   * @param client - The connected Socket.IO client
   * @param userId - UUID of the authenticated user
   */
  @SubscribeMessage('join:user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ): void {
    void client.join(`user:${userId}`);
    this.logger.log(`Client ${client.id} joined user:${userId}`);
  }

  // ─── Broadcast Methods (called by consumers) ──────────────────────────────

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
      altitude: number;
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
    },
  ): void {
    this.server.to(`device:${deviceId}`).emit('device-status:update', {
      deviceId,
      ...data,
    });
  }

  // ─── Lifecycle Hooks ──────────────────────────────────────────────────────

  /**
   * Logs when a new client connects to the WebSocket gateway.
   */
  handleConnection(client: Socket): void {
    this.logger.log(`WS Client connected: ${client.id}`);
  }

  /**
   * Logs when a client disconnects from the WebSocket gateway.
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`WS Client disconnected: ${client.id}`);
  }
}
