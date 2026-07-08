import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { DeviceStatus } from './entities/device-status.entity';
import { DeviceStatusEnum } from '@/commons/enums/app.enum';
import { GnssGateway } from '@/gateways/gnss.gateway';
import { LoggerService } from '@/commons/logger/logger.service';

/**
 * Service chạy ngầm, định kỳ quét bảng device_status.
 * Nếu thiết bị không báo trạng thái hoặc gửi telemetry trong hơn 5 phút (300s),
 * tự động chuyển sang OFFLINE và broadcast thay đổi trạng thái qua WebSocket.
 */
@Injectable()
export class OfflineDetectorService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new LoggerService(OfflineDetectorService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(DeviceStatus)
    private readonly deviceStatusRepository: Repository<DeviceStatus>,
    private readonly gnssGateway: GnssGateway,
  ) {}

  onModuleInit() {
    // Không chạy interval khi test để tránh Jest bị leak open handle
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.logger.log('Offline Detector heartbeat sweep initialized.');
    // Quét mỗi 60 giây
    this.timer = setInterval(() => {
      this.sweepHeartbeats().catch((err: unknown) => {
        this.logger.error(
          'Failed to run offline heartbeat sweep',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, 60 * 1000);
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Quét bảng device_status tìm các thiết bị đang 'online' nhưng
   * không nhận được báo cáo trạng thái hoặc telemetry nào trong 5 phút,
   * chuyển chúng sang 'offline' và broadcast thay đổi qua WebSocket.
   */
  async sweepHeartbeats(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const offlineStatusList = await this.deviceStatusRepository.find({
      where: {
        status: DeviceStatusEnum.ONLINE,
        updatedAt: LessThan(fiveMinutesAgo),
      },
    });

    if (offlineStatusList.length === 0) {
      return;
    }

    this.logger.log(
      `Heartbeat sweep: Found ${offlineStatusList.length} device(s) inactive for > 5 minutes. Marking offline...`,
    );

    for (const status of offlineStatusList) {
      status.status = DeviceStatusEnum.OFFLINE;
      await this.deviceStatusRepository.save(status);

      // Broadcast trạng thái mới qua WebSocket
      this.gnssGateway.broadcastDeviceStatus(status.deviceId, {
        status: DeviceStatusEnum.OFFLINE,
        batteryLevel: status.batteryLevel,
        cameraStatus: status.cameraStatus,
        gnssStatus: status.gnssStatus,
        satellitesTracked: status.satellitesTracked,
        signalStrength: status.signalStrength,
      });

      this.logger.warn(
        `Device ${status.deviceId} heartbeat expired (last seen: ${status.updatedAt.toISOString()}). Automatically marked OFFLINE.`,
      );
    }
  }
}
