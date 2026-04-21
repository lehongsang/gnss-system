/**
 * Enum representing user roles in the system
 */
export enum Role {
  /** Administrator - has full permissions in the system */
  ADMIN = 'admin',
  /** Regular user */
  USER = 'user',
}
export const ALL_ROLES = [Role.USER, Role.ADMIN];

// ─── Alerts ────────────────────────────────────────────────────────────────────

/**
 * Enum representing the type / category of a device alert.
 */
export enum AlertType {
  /** Device route deviates from the expected trajectory */
  TRAJECTORY_DEVIATION = 'trajectory_deviation',
  /** Dangerous obstacle detected ahead */
  DANGEROUS_OBSTACLE = 'dangerous_obstacle',
  /** GNSS / communication signal lost */
  SIGNAL_LOST = 'signal_lost',
  /** Device has exited an assigned geofence boundary */
  GEOFENCE_EXIT = 'geofence_exit',
  /** Device is travelling above the allowed speed limit */
  SPEEDING = 'speeding',
}

// ─── Device Status ─────────────────────────────────────────────────────────────

/**
 * Enum representing the operational status of a device.
 */
export enum DeviceStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

// ─── Media Logs ────────────────────────────────────────────────────────────────

/**
 * Enum representing the type of media captured by a device camera.
 */
export enum MediaType {
  VIDEO_CHUNK = 'video_chunk',
  IMAGE_FRAME = 'image_frame',
}

// ─── Telemetry ─────────────────────────────────────────────────────────────────

/**
 * Enum describing the sensor fusion mode used to produce a GPS fix.
 */
export enum AccuracyStatus {
  /** Position derived from GNSS receiver alone */
  GNSS_ONLY = 'gnss_only',
  /** Position derived from computer-vision odometry alone */
  VISION_ONLY = 'vision_only',
  /** Position is a fusion of GNSS and vision systems */
  FUSED = 'fused',
}

