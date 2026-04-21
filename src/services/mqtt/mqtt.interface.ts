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
  /** Altitude in meters above sea level */
  altitude: number;
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
}
