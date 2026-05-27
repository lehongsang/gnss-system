import { Module } from '@nestjs/common';
import { GnssGateway } from './gnss.gateway';
import { DevicesModule } from '@/modules/devices/devices.module';

/**
 * Module that provides the GnssGateway WebSocket service.
 * Import this module into any feature module that needs to broadcast
 * realtime events (telemetry, alerts, device status) to connected clients.
 */
@Module({
  imports: [DevicesModule],
  providers: [GnssGateway],
  exports: [GnssGateway],
})
export class GnssGatewayModule {}
