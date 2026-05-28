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
  /** UTC timestamp of the GPS fix */
  timestamp: Date;
  /** Fusion mode describing the accuracy source */
  accuracyStatus: AccuracyStatus;
}

// ─── Alerts ────────────────────────────────────────────────────────────────────

/**
 * Kafka message payload for device alerts consumed from GNSS_ALERTS topic
 * (originated from MqttService bridging gnss/{id}/alert).
 */
export interface AlertKafkaPayload {
  /** UUID of the device that triggered the alert */
  deviceId: string;
  /** Alert type matching AlertType enum value */
  type: string;
  /** Severity level: LOW | MEDIUM | HIGH | CRITICAL */
  severity: string;
  /** Human-readable alert description */
  message: string;
  /** Geographic coordinates where the alert occurred */
  location: { lng: number; lat: number };
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
  /** Optional correlation ID used to link this alert with a snapshot image */
  snapshotId?: string;
}

// ─── Device Status ─────────────────────────────────────────────────────────────

/**
 * Kafka message payload for device heartbeat consumed from GNSS_DEVICE_STATUS topic.
 */
export interface DeviceStatusKafkaPayload {
  /** UUID of the device */
  deviceId: string;
  /** Operational status: online | offline | maintenance */
  status: string;
  /** Battery level as a percentage (0–100) */
  batteryLevel: number;
  /** Whether the on-board camera is operational */
  cameraStatus: boolean;
  /** Whether the GNSS receiver is operational */
  gnssStatus: boolean;
  /** Number of satellites currently tracked by the GNSS receiver */
  satellitesTracked?: number;
  /** Signal strength percentage reported by the device (0-100) */
  signalStrength?: number;
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
}

// ─── Users / Auth ──────────────────────────────────────────────────────────────

/**

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

// ─── Messaging Envelope ────────────────────────────────────────────────────────

/**
 * Standard messaging envelope for all GNSS telemetry, alerts, media and status updates.
 */
export interface GnssKafkaEnvelope<T = unknown> {
  /** Traceability / correlation ID to link event workflows */
  correlationId: string;
  /** The unique device UUID */
  deviceId: string;
  /** ISO 8601 string of when the gateway received the message from MQTT broker */
  receivedAt: string;
  /** Number of retry attempts done (0 for new messages) */
  retryCount: number;
  /** The original domain-specific payload */
  payload: T;
}
