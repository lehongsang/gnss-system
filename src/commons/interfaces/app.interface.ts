import type { AccuracyStatus } from '@/commons/enums/app.enum';


// ─── Geographic / Location ─────────────────────────────────────────────────────

export interface Address {
  province: string;
  ward: string;
  detail: string;
  district?: string;
}

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

// ─── Telemetry ─────────────────────────────────────────────────────────────────

/**
 * Payload structure for a GPS coordinate point received from Kafka
 * (originated from MqttService bridging gnss/{id}/coordinates).
 */
export interface CoordinatePayload {
  /** Longitude in decimal degrees (WGS84) */
  lng: number;
  /** Latitude in decimal degrees (WGS84) */
  lat: number;
  /** Speed in km/h reported by device */
  speed: number;
  /** Heading in degrees (0–360, clockwise from North) */
  heading: number;
  /** Altitude in meters above sea level */
  altitude: number;
  /** UTC timestamp of the GPS fix */
  timestamp: Date;
  /** Fusion mode describing the accuracy source */
  accuracyStatus: AccuracyStatus;
}

// ─── Users / Auth ──────────────────────────────────────────────────────────────

/**
 * Data shape required when registering a new user manually
 * (e.g., via admin API or OTP-based sign-up flow).
 */
export interface RegistrationUserData {
  email: string;
  password: string;
  name: string;
  otp: string;
  /** Unix timestamp (ms) marking when the registration request was created */
  createdAt: number;
}

