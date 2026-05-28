import { RoutePlan } from '../entities/route-plan.entity';

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteStep {
  name?: string;
  distanceMeters: number;
  durationSeconds: number;
  instruction?: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string | null;
  geojson: GeoJSONLineString;
  provider: 'mapbox';
  profile: string;
  steps?: RouteStep[];
}

export type EnrichedRoutePlan = Omit<RoutePlan, 'geom' | 'generateId'> & {
  geom: GeoJSONLineString | null;
};
