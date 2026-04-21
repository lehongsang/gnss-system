/**
 * Enum representing all Kafka topic names used in the GNSS system.
 * Always use this enum — never raw string literals.
 *
 * Rule: src/commons/constants/ is the canonical location for Kafka topics.
 */
export enum KafkaTopic {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  /** Trigger email dispatch (OTP, password-reset) */
  AUTH_MAIL = 'auth.mail',
  /** Dead-letter queue for failed auth mail jobs */
  AUTH_MAIL_DLQ = 'auth.mail.dlq',

  // ─── Storage ───────────────────────────────────────────────────────────────
  /** Asynchronous file upload to SeaweedFS/S3 */
  STORAGE_UPLOAD = 'storage.upload',
  /** Asynchronous file deletion from S3 */
  STORAGE_DELETE = 'storage.delete',

  // ─── GNSS ──────────────────────────────────────────────────────────────────
  /** Realtime GPS coordinates bridged from MQTT: { deviceId, lng, lat, speed, heading, altitude, timestamp } */
  GNSS_COORDINATES = 'gnss.coordinates',
  /** Device alerts bridged from MQTT: { deviceId, type, severity, message, location, timestamp } */
  GNSS_ALERTS = 'gnss.alerts',
  /** Camera images / video clips bridged from MQTT: { deviceId, mediaType, data (base64), mimeType, timestamp } */
  GNSS_MEDIA_UPLOAD = 'gnss.media.upload',
  /** Online/offline heartbeat from device: { deviceId, status, batteryLevel, timestamp } */
  GNSS_DEVICE_STATUS = 'gnss.device.status',
}

/**
 * Enum representing Kafka consumer group IDs.
 * Group IDs must be unique per logical consumer to avoid offset conflicts.
 */
export enum KafkaConsumerGroup {
  AUTH_MAIL = 'auth.mail.group',
  STORAGE_UPLOAD = 'storage.upload.group',
  STORAGE_DELETE = 'storage.delete.group',
  GNSS_COORDINATES = 'gnss.coordinates.group',
  GNSS_ALERTS = 'gnss.alerts.group',
  GNSS_MEDIA_UPLOAD = 'gnss.media.upload.group',
  GNSS_DEVICE_STATUS = 'gnss.device.status.group',
}
