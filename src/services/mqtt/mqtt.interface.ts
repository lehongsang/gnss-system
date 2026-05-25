/**
 * Payload for GPS coordinates received from an MQTT device.
 * Topic: gnss/{deviceId}/coordinates
 */
export interface MqttCoordinatesPayload {
  /** Longitude in decimal degrees */
  lng: number;
  /** Latitude in decimal degrees */
  lat: number;
  /** Speed in km/h */
  speed: number;
  /** Compass heading in degrees (0–360) */
  heading: number;
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
}

/**
 * Payload for an alert event received from an MQTT device.
 * Topic: gnss/{deviceId}/alert
 */
export interface MqttAlertPayload {
  /** Alert type string (matches AlertType enum values) */
  type: string;
  /** Severity level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' */
  severity: string;
  /** Human-readable alert description */
  message: string;
  /** Longitude at which the alert occurred */
  lng: number;
  /** Latitude at which the alert occurred */
  lat: number;
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
  /** Optional correlation ID used to link this alert with a snapshot image */
  snapshotId?: string;
}

/**
 * Kafka message payload forwarded to gnss.media.upload topic.
 */
export interface MqttMediaPayload {
  deviceId: string;
  mediaType: 'image' | 'video';
  /** Base64-encoded file content */
  data: string;
  mimeType: string;
  timestamp: string;
  /** Optional correlation ID used to link this media with an alert */
  snapshotId?: string;
}

/**
 * Payload for device status heartbeat received from an MQTT device.
 * Topic: gnss/{deviceId}/status
 */
export interface MqttDeviceStatusPayload {
  status: string;
  batteryLevel: number;
  cameraStatus: boolean;
  gnssStatus: boolean;
  /** Number of satellites currently tracked by the GNSS receiver */
  satellitesTracked?: number;
  /** Signal strength percentage reported by the device (0-100) */
  signalStrength?: number;
}
