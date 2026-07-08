import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DevicesService } from '@/modules/devices/devices.service';
import { MqttService } from '@/services/mqtt/mqtt.service';
import { RedisService } from '@/services/redis/redis.service';
import { MediaServerService } from '@/services/media-server/media-server.service';
import {
  LiveStreamSession,
  LiveStreamStatus,
} from '@/commons/interfaces/live-stream.interface';
import { StartLiveStreamDto } from './dtos/start-live-stream.dto';
import { LiveStreamResponse } from './dtos/live-stream.response';

const DEFAULT_DURATION_SECONDS = 300;

@Injectable()
export class LiveStreamsService {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly mqttService: MqttService,
    private readonly redisService: RedisService,
    private readonly mediaServerService: MediaServerService,
  ) {}

  /**
   * Bắt đầu phiên live stream bằng cách gửi lệnh MQTT xuống thiết bị.
   */
  async start(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
    dto: StartLiveStreamDto,
  ): Promise<LiveStreamResponse> {
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);

    const durationSeconds = dto.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    const requestId = `stream-${randomUUID()}`;
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const session: LiveStreamSession = {
      requestId,
      deviceId,
      status: LiveStreamStatus.STARTING,
      rtspUrl: null,
      webrtcUrl: null,
      startedBy: requesterId,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // TTL của session trong Redis = thời lượng stream, hết hạn thì session tự biến mất
    await this.redisService.setex(
      this.getSessionKey(deviceId),
      durationSeconds,
      JSON.stringify(session),
    );

    await this.mqttService.publishJson(
      `gnss/${deviceId}/command/start_stream`,
      {
        requestId,
        streamType: 'rtsp',
        mediaPath: this.mediaServerService.buildPath(deviceId),
        durationSeconds,
      },
    );

    return this.toResponse(session);
  }

  /**
   * Dừng phiên live stream đang chạy bằng cách gửi lệnh MQTT xuống thiết bị.
   */
  async stop(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<LiveStreamResponse> {
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);

    const session = await this.getSession(deviceId);
    const stoppedSession: LiveStreamSession = {
      ...session,
      status: LiveStreamStatus.STOPPED,
      webrtcUrl: null,
    };

    // Giữ lại session ở trạng thái STOPPED thêm 60s để client kịp query status trước khi mất
    await this.redisService.setex(
      this.getSessionKey(deviceId),
      60,
      JSON.stringify(stoppedSession),
    );

    await this.mqttService.publishJson(
      `gnss/${deviceId}/command/stop_stream`,
      {
        requestId: session.requestId,
      },
    );
    await this.mediaServerService.removePath(
      this.mediaServerService.buildPath(deviceId),
    );

    return this.toResponse(stoppedSession);
  }

  /**
   * Lấy thông tin phiên live stream hiện tại của thiết bị.
   */
  async getStatus(
    deviceId: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<LiveStreamResponse> {
    await this.devicesService.findOne(deviceId, requesterId, isAdmin);
    return this.toResponse(await this.getSession(deviceId));
  }

  private async getSession(deviceId: string): Promise<LiveStreamSession> {
    const rawSession = await this.redisService.get(this.getSessionKey(deviceId));
    if (!rawSession) {
      throw new NotFoundException('Live stream session not found');
    }
    return JSON.parse(rawSession) as LiveStreamSession;
  }

  private getSessionKey(deviceId: string): string {
    return `live-stream:${deviceId}`;
  }

  private toResponse(session: LiveStreamSession): LiveStreamResponse {
    return {
      requestId: session.requestId,
      deviceId: session.deviceId,
      status: session.status,
      webrtcUrl: session.webrtcUrl,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      errorMessage: session.errorMessage,
    };
  }
}
