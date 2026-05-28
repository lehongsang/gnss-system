import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutePlan } from './entities/route-plan.entity';
import { RoutePlansController } from './route-plans.controller';
import { RoutePlansService } from './route-plans.service';
import { RoutingProviderService } from './routing-provider.service';
import { RouteDeviationService } from './route-deviation.service';
import { DevicesModule } from '@/modules/devices/devices.module';
import { AlertsModule } from '@/modules/alerts/alerts.module';

@Module({
  imports: [TypeOrmModule.forFeature([RoutePlan]), DevicesModule, AlertsModule],
  controllers: [RoutePlansController],
  providers: [RoutePlansService, RoutingProviderService, RouteDeviationService],
  exports: [RoutePlansService, RouteDeviationService],
})
export class RoutePlansModule {}
