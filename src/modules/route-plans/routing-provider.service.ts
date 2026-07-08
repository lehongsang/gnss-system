import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PreviewRouteDto } from './dtos/preview-route.dto';
import { GeoJSONLineString, RouteResult, RouteStep } from './dtos/route-plan.response';

interface MapboxStep {
  name?: string;
  distance: number;
  duration: number;
  maneuver?: {
    instruction?: string;
  };
}

interface MapboxDirectionsResponse {
  routes?: {
    distance: number;
    duration: number;
    geometry: GeoJSONLineString;
    legs?: {
      steps?: MapboxStep[];
    }[];
  }[];
  message?: string;
  code?: string;
}

// Map mode di chuyển của app sang profile tương ứng bên Mapbox Directions API
const MODE_TO_PROFILE: Record<string, string> = {
  driving: 'mapbox/driving',
  walking: 'mapbox/walking',
  cycling: 'mapbox/cycling',
};

@Injectable()
export class RoutingProviderService {
  constructor(private readonly configService: ConfigService) {}

  async getRoute(dto: PreviewRouteDto): Promise<RouteResult> {
    // Hiện chỉ hỗ trợ Mapbox, để sẵn config ROUTING_PROVIDER phòng khi thêm provider khác
    const provider = this.configService.get<string>(
      'ROUTING_PROVIDER',
      'mapbox',
    );
    if (provider !== 'mapbox') {
      throw new ServiceUnavailableException(
        `Unsupported routing provider: ${provider}`,
      );
    }

    return this.getMapboxRoute(dto);
  }

  private async getMapboxRoute(dto: PreviewRouteDto): Promise<RouteResult> {
    const accessToken = this.configService.get<string>('MAPBOX_ACCESS_TOKEN');
    if (!accessToken) {
      throw new ServiceUnavailableException('MAPBOX_ACCESS_TOKEN is not configured');
    }

    const profile = this.resolveProfile(dto.mode);
    const coordinates = `${dto.origin.lng},${dto.origin.lat};${dto.destination.lng},${dto.destination.lat}`;
    const url = new URL(
      `https://api.mapbox.com/directions/v5/${profile}/${coordinates}`,
    );
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('access_token', accessToken);

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      // Lỗi mạng/timeout khi gọi Mapbox -> coi như dịch vụ routing tạm thời không dùng được
      throw new ServiceUnavailableException('Routing provider unavailable');
    }

    // Body có thể không phải JSON hợp lệ, tránh throw parse lỗi thì fallback về object rỗng
    const body = (await response.json().catch(() => ({}))) as MapboxDirectionsResponse;
    if (!response.ok) {
      if (response.status === 404 || body.code === 'NoRoute') {
        throw new NotFoundException('Route not found');
      }
      throw new ServiceUnavailableException(
        body.message || 'Routing provider unavailable',
      );
    }

    // Mapbox trả routes rỗng nhưng vẫn 200 OK trong vài trường hợp -> vẫn phải tự kiểm tra
    const route = body.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      throw new NotFoundException('Route not found');
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: Math.round(route.duration),
      encodedPolyline: null,
      geojson: route.geometry,
      provider: 'mapbox',
      profile,
      steps: this.mapSteps(route.legs?.[0]?.steps),
    };
  }

  private resolveProfile(mode?: string): string {
    if (mode && MODE_TO_PROFILE[mode]) {
      return MODE_TO_PROFILE[mode];
    }

    // Không truyền mode hoặc mode lạ -> dùng profile mặc định từ config
    return this.configService.get<string>(
      'MAPBOX_DIRECTIONS_PROFILE',
      'mapbox/driving',
    );
  }

  private mapSteps(steps: MapboxStep[] | undefined): RouteStep[] | undefined {
    if (!Array.isArray(steps)) return undefined;

    return steps.map((step) => ({
      name: typeof step.name === 'string' ? step.name : undefined,
      distanceMeters: Number(step.distance),
      durationSeconds: Math.round(Number(step.duration)),
      instruction:
        typeof step.maneuver?.instruction === 'string'
          ? step.maneuver.instruction
          : undefined,
    }));
  }
}
