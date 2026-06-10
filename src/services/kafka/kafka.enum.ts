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
  /** Realtime GPS coordinates bridged from MQTT: { deviceId, lng, lat, speed, heading, timestamp } */
  GNSS_COORDINATES = 'gnss.coordinates',
  /** Dead-letter queue for failed coordinates processing */
  GNSS_COORDINATES_DLQ = 'gnss.coordinates.dlq',
  /** Device alerts bridged from MQTT: { deviceId, type, severity, message, location, timestamp } */
  GNSS_ALERTS = 'gnss.alerts',
  /** Dead-letter queue for failed alerts processing */
  GNSS_ALERTS_DLQ = 'gnss.alerts.dlq',
  /** Camera images / video clips bridged from MQTT: { deviceId, mediaType, data (base64), mimeType, timestamp } */
  GNSS_MEDIA_UPLOAD = 'gnss.media.upload',
  /** Dead-letter queue for failed media upload jobs */
  GNSS_MEDIA_UPLOAD_DLQ = 'gnss.media.upload.dlq',
  /** Online/offline heartbeat from device: { deviceId, status, batteryLevel, timestamp } */
  GNSS_DEVICE_STATUS = 'gnss.device.status',
  /** Dead-letter queue for failed device status updates */
  GNSS_DEVICE_STATUS_DLQ = 'gnss.device.status.dlq',
  /** Asynchronous video processing job request */
  GNSS_MEDIA_PROCESS_JOB = 'gnss.media.process.jobs',
  /** Asynchronous video processing job result */
  GNSS_MEDIA_PROCESS_RESULT = 'gnss.media.process.results',
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
  GNSS_MEDIA_PROCESS_RESULT = 'gnss.media.process.results.group',
}
