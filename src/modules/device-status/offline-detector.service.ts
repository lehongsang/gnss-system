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
 * Background service that periodically sweeps the device_status table.
 * If a device has not reported its status or sent telemetry in more than 5 minutes (300s),
 * it is automatically set to OFFLINE and the status change is broadcasted via WebSockets.
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
    // Avoid running intervals during tests to prevent Jest open handles leak
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.logger.log('Offline Detector heartbeat sweep initialized.');
    // Run the sweep every 60 seconds
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
   * Sweeps the device_status table for active 'online' devices that
   * haven't received a status report or telemetry point in 5 minutes,
   * setting them to 'offline' and broadcasting the status change via WS.
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

      // Broadcast new status via WebSocket
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
