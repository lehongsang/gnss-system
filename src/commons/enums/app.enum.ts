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

// ─── User Status ───────────────────────────────────────────────────────────────

/**
 * Enum representing the account status of a user.
 */
export enum UserStatus {
  /** User has registered but not yet verified */
  PENDING = 'pending',
  /** User account is active and verified */
  ACTIVE = 'active',
  /** User account has been deactivated */
  INACTIVE = 'inactive',
}

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
  GEOFENCE_ENTRY = 'geofence_entry',
  /** Device is travelling above the allowed speed limit */
  SPEEDING = 'speeding',
  /** AI-detected sudden motion event (e.g., hard braking, collision) from Optical Flow analysis */
  SUDDEN_MOTION = 'sudden_motion',
  /** AI-detected abnormal stop (vehicle stationary while marked as moving) from Optical Flow analysis */
  ABNORMAL_STOP = 'abnormal_stop',
}

// ─── Device Status ─────────────────────────────────────────────────────────────

/**
 * Enum representing the operational status of a device.
 */
/**
 * Enum representing the rule type applied to a geofence.
 */
export enum GeofenceType {
  ALLOWED_ZONE = 'allowed_zone',
  FORBIDDEN_ZONE = 'forbidden_zone',
}

export enum DeviceStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

// ─── Media Logs ────────────────────────────────────────────────────────────────

/**
 * Enum representing the type of media captured by a device camera.
 */
export enum RoutePlanStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

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

