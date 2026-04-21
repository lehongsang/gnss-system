/**
 * Enum representing S3/SeaweedFS folder paths.
 * Always use this enum as the folder argument in StorageService.uploadFile().
 */
export enum StoragePath {
  // ─── Users ─────────────────────────────────────────────────────────────────
  /** User avatar images */
  USERS_AVATAR = 'users/avatar',

  // ─── GNSS Media ────────────────────────────────────────────────────────────
  /** Still frames captured by GNSS device cameras (ingested via MQTT → Kafka) */
  GNSS_IMAGES = 'gnss/images',
  /** Video clips captured by GNSS device cameras (ingested via MQTT → Kafka) */
  GNSS_VIDEOS = 'gnss/videos',

  // ─── General ───────────────────────────────────────────────────────────────
  /** Default destination for general-purpose uploads */
  UPLOADS = 'uploads',
  /** Temporary staging area for async uploads before processing */
  TEMPORARY = 'temporary',
}

/**
 * Enum representing the processing status of a Media record.
 */
export enum MediaStatus {
  /** File upload queued but not yet written to S3 */
  PENDING = 'PENDING',
  /** File successfully uploaded and accessible */
  COMPLETED = 'COMPLETED',
  /** Upload failed after retry exhaustion */
  FAILED = 'FAILED',
}
